from datetime import datetime, timezone
import httpx
import structlog

from app.adapters.base import SourceAdapter
from app.adapters.registry import register_adapter
from app.models.domain import JobCreate
from app.core.config import settings
from app.core.exceptions import ParseError, classify_http_error

log = structlog.get_logger()

@register_adapter("sandbox")
class SandboxAdapter(SourceAdapter):
    """
    Adapter for the Chaos Sandbox server.
    Hits the mock endpoint which injects deliberate failures (429, 502, timeouts).
    """
    def __init__(self, base_url: str | None = None, **kwargs):
        self.base_url = base_url or settings.SANDBOX_URL

    async def fetch_jobs(self) -> list[JobCreate]:
        url = f"{self.base_url}/api/remote-jobs"
        log.info("adapter.fetch_start", source="sandbox", url=url)
        
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(url)
            
            if response.status_code != 200:
                raise classify_http_error(response.status_code, "sandbox")
                
            data = response.json()
            
            if "jobs" not in data:
                raise ParseError("Sandbox response missing 'jobs' key", source="sandbox")
                
            raw_jobs = data["jobs"]
            jobs = []
            
            for item in raw_jobs:
                try:
                    jobs.append(self._normalize(item))
                except (KeyError, TypeError, ValueError) as e:
                    log.warning("adapter.parse_error", source="sandbox", error=str(e), raw_id=item.get("id"))
                    
            log.info("adapter.fetch_complete", source="sandbox", total=len(raw_jobs), parsed=len(jobs))
            return jobs

    def _normalize(self, raw: dict) -> JobCreate:
        """
        Normalizes sandbox jobs.
        To simulate schema change chaos, if 'title' is missing, it will fail Pydantic validation (as it's a required field with min_length).
        """
        # If 'title' is intentionally broken/missing from the chaos server, this will raise a KeyError
        # Or if we want Pydantic to fail it, we pass it along. Let's pass it along exactly as is to let Pydantic handle it.
        return JobCreate(
            source="sandbox",
            source_job_id=str(raw.get("id", "")),
            title=raw.get("title", ""),
            company=raw.get("company_name", ""),
            location="Remote",
            description=raw.get("description", "Mock description"),
            url=raw.get("url", ""),
            posted_at=datetime.now(timezone.utc),
        )

    async def health_check(self) -> bool:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.head(f"{self.base_url}/api/remote-jobs")
                return response.status_code < 500
        except Exception:
            return False
