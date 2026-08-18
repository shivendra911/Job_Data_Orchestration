"""
Hacker News "Who is Hiring" adapter via Algolia HN Search API.
"""
import re
from datetime import datetime, timezone
from html import unescape

import httpx
import structlog

from app.adapters.base import SourceAdapter
from app.adapters.registry import register_adapter
from app.core.config import settings
from app.core.exceptions import ParseError, classify_http_error
from app.models.domain import JobCreate

log = structlog.get_logger()


@register_adapter("hn_hiring")
class HNHiringAdapter(SourceAdapter):
    def __init__(self, base_url: str | None = None, **kwargs):
        self.base_url = base_url or settings.HN_ALGOLIA_URL

    async def fetch_jobs(self) -> list[JobCreate]:
        log.info("adapter.fetch_start", source="hn_hiring")

        thread_id = await self._find_latest_thread()
        if not thread_id:
            raise ParseError("Could not find latest 'Who is hiring' thread", source="hn_hiring")

        log.info("adapter.thread_found", source="hn_hiring", thread_id=thread_id)

        comments = await self._fetch_comments(thread_id)
        log.info("adapter.comments_fetched", source="hn_hiring", count=len(comments))

        jobs = []
        for comment in comments:
            try:
                job = self._parse_comment(comment)
                if job:
                    jobs.append(job)
            except Exception as e:
                log.debug("adapter.comment_skip", reason=str(e), comment_id=comment.get("id"))

        log.info("adapter.fetch_complete", source="hn_hiring", comments=len(comments), jobs=len(jobs))
        return jobs

    async def _find_latest_thread(self) -> str | None:
        async with httpx.AsyncClient(timeout=settings.HTTP_TIMEOUT_SECONDS) as client:
            response = await client.get(
                f"{self.base_url}/search",
                params={
                    "query": "Who is hiring",
                    "tags": "story,author_whoishiring",
                    "hitsPerPage": 1,
                },
            )

            if response.status_code != 200:
                raise classify_http_error(response.status_code, "hn_hiring")

            data = response.json()
            hits = data.get("hits", [])

            if not hits:
                return None

            return hits[0]["objectID"]

    async def _fetch_comments(self, thread_id: str) -> list[dict]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{self.base_url}/items/{thread_id}")

            if response.status_code != 200:
                raise classify_http_error(response.status_code, "hn_hiring")

            data = response.json()
            return data.get("children", [])

    def _parse_comment(self, comment: dict) -> JobCreate | None:
        text = comment.get("text", "")
        if not text or len(text) < 20:
            return None

        clean_text = self._strip_html(text)

        lower_text = clean_text.lower()
        if any(phrase in lower_text for phrase in [
            "looking for work", "seeking", "freelancer available",
            "want to be hired", "résumé", "resume at",
        ]):
            return None

        lines = clean_text.split("\n")
        first_line = lines[0].strip()

        parts = re.split(r"\s*[|—–]\s*", first_line)

        if len(parts) < 2:
            company = "Unknown (HN)"
            title = first_line[:200]
            location = None
        else:
            company = parts[0].strip()
            title = parts[1].strip() if len(parts) > 1 else "Unknown Role"
            location = parts[2].strip() if len(parts) > 2 else None

        remote = any(word in lower_text for word in ["remote", "distributed", "anywhere"])

        description = "\n".join(lines[1:]).strip()[:2000]

        if len(company) < 2 or len(title) < 3:
            return None

        comment_id = comment.get("id", comment.get("objectID", ""))
        url = f"https://news.ycombinator.com/item?id={comment_id}"

        posted_at = None
        created_at_i = comment.get("created_at_i")
        if created_at_i:
            posted_at = datetime.fromtimestamp(created_at_i, tz=timezone.utc)

        return JobCreate(
            source="hn_hiring",
            source_job_id=str(comment_id),
            title=title[:500],
            company=company[:255],
            location=location,
            description=description if description else None,
            remote=remote,
            url=url,
            posted_at=posted_at,
        )

    @staticmethod
    def _strip_html(html: str) -> str:
        clean = re.sub(r"<[^>]+>", "\n", html)
        clean = unescape(clean)
        clean = re.sub(r"\n{3,}", "\n\n", clean)
        return clean.strip()

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.get(f"{self.base_url}/search", params={"query": "test", "hitsPerPage": 1})
                return response.status_code == 200
        except Exception:
            return False
