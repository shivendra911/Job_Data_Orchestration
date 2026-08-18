"""
Arbeitnow API adapter.
"""
import asyncio
from datetime import datetime, timezone

import httpx
import structlog

from app.adapters.base import SourceAdapter
from app.adapters.registry import register_adapter
from app.core.config import settings
from app.core.exceptions import ParseError, classify_http_error
from app.models.domain import JobCreate

log = structlog.get_logger()


@register_adapter("arbeitnow")
class ArbeitnowAdapter(SourceAdapter):
    def __init__(self, base_url: str | None = None, **kwargs):
        self.base_url = base_url or settings.ARBEITNOW_URL

    async def fetch_jobs(self) -> list[JobCreate]:
        log.info("adapter.fetch_start", source="arbeitnow", url=self.base_url)

        async with httpx.AsyncClient(
            timeout=settings.HTTP_TIMEOUT_SECONDS,
            headers={
                "Accept": "application/json",
                "User-Agent": "JobIngestionPlatform/1.0",
            },
        ) as client:
            response = await client.get(self.base_url)

            if response.status_code != 200:
                raise classify_http_error(response.status_code, "arbeitnow")

            data = response.json()

        if "data" not in data:
            raise ParseError(
                "Arbeitnow response missing 'data' key",
                source="arbeitnow",
                details={"keys_found": list(data.keys())},
            )

        raw_jobs = data["data"]
        jobs = []

        for item in raw_jobs:
            try:
                jobs.append(self._normalize(item))
            except (KeyError, TypeError, ValueError) as e:
                log.warning("adapter.parse_error", source="arbeitnow", error=str(e), raw_id=item.get("slug"))

        log.info("adapter.fetch_complete", source="arbeitnow", total=len(raw_jobs), parsed=len(jobs))
        return jobs

    def _normalize(self, raw: dict) -> JobCreate:
        posted_at = None
        if raw.get("created_at"):
            try:
                posted_at = datetime.fromtimestamp(raw["created_at"], tz=timezone.utc)
            except (ValueError, TypeError):
                pass
                
        # Handle tags and job_types safely as lists
        tags = raw.get("tags") or []
        job_types = raw.get("job_types") or []
        employment_type = job_types[0] if job_types else None

        return JobCreate(
            source="arbeitnow",
            source_job_id=str(raw.get("slug", "")),
            title=raw["title"],
            company=raw["company_name"],
            location=raw.get("location"),
            description=raw.get("description"),
            employment_type=employment_type,
            remote=raw.get("remote", False),
            url=raw["url"],
            tags=tags,
            posted_at=posted_at,
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.head(self.base_url)
                return response.status_code < 500
        except Exception:
            return False
