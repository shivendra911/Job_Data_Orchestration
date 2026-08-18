"""
Remotive.com public API adapter.
"""
import asyncio
from datetime import datetime

import httpx
import structlog

from app.adapters.base import SourceAdapter
from app.adapters.registry import register_adapter
from app.core.config import settings
from app.core.exceptions import ParseError, classify_http_error
from app.models.domain import JobCreate

log = structlog.get_logger()


@register_adapter("remotive")
class RemotiveAdapter(SourceAdapter):
    def __init__(self, base_url: str | None = None, **kwargs):
        self.base_url = base_url or settings.REMOTIVE_URL

    async def fetch_jobs(self) -> list[JobCreate]:
        log.info("adapter.fetch_start", source="remotive", url=self.base_url)

        async with httpx.AsyncClient(
            timeout=settings.HTTP_TIMEOUT_SECONDS,
            headers={
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
                "User-Agent": "JobIngestionPlatform/1.0 (educational project)",
            },
        ) as client:
            response = await client.get(self.base_url)

            if response.status_code != 200:
                raise classify_http_error(response.status_code, "remotive")

            data = response.json()

        if "jobs" not in data:
            raise ParseError(
                "Remotive response missing 'jobs' key — schema may have changed",
                source="remotive",
                details={"keys_found": list(data.keys())},
            )

        raw_jobs = data["jobs"]
        jobs = []

        for item in raw_jobs:
            try:
                jobs.append(self._normalize(item))
            except (KeyError, TypeError, ValueError) as e:
                log.warning("adapter.parse_error", source="remotive", error=str(e), raw_id=item.get("id"))

        log.info("adapter.fetch_complete", source="remotive", total=len(raw_jobs), parsed=len(jobs))
        return jobs

    def _normalize(self, raw: dict) -> JobCreate:
        salary_min, salary_max, currency = self._parse_salary(raw.get("salary", ""))

        posted_at = None
        if raw.get("publication_date"):
            try:
                posted_at = datetime.fromisoformat(
                    raw["publication_date"].replace("Z", "+00:00")
                )
            except ValueError:
                pass

        return JobCreate(
            source="remotive",
            source_job_id=str(raw["id"]),
            title=raw["title"],
            company=raw["company_name"],
            location=raw.get("candidate_required_location", "Remote"),
            description=raw.get("description"),
            employment_type=raw.get("job_type"),
            salary_min=salary_min,
            salary_max=salary_max,
            salary_currency=currency,
            remote=True,
            url=raw["url"],
            tags=raw.get("tags", []),
            posted_at=posted_at,
        )

    @staticmethod
    def _parse_salary(salary_str: str) -> tuple[float | None, float | None, str | None]:
        if not salary_str or salary_str.strip().lower() in ("", "competitive", "negotiable"):
            return None, None, None

        import re

        currency = None
        if "$" in salary_str:
            currency = "USD"
        elif "€" in salary_str:
            currency = "EUR"
        elif "£" in salary_str:
            currency = "GBP"

        numbers = re.findall(r"[\d,]+\.?\d*", salary_str.replace(",", ""))
        if not numbers:
            return None, None, currency

        parsed = []
        for num_str in numbers:
            val = float(num_str)
            if "k" in salary_str.lower():
                if val < 1000:
                    val *= 1000
            parsed.append(val)

        if len(parsed) >= 2:
            return parsed[0], parsed[1], currency
        elif len(parsed) == 1:
            return parsed[0], parsed[0], currency

        return None, None, currency

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.head(self.base_url)
                return response.status_code < 500
        except Exception:
            return False
