"""
Deduplication logic and fingerprinting for jobs.
"""
import hashlib
import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Job
from app.models.domain import JobCreate



def _normalize_string(s: str | None) -> str:
    if not s:
        return ""
    s = s.lower()
    # Remove common modifiers
    s = re.sub(r'\b(sr\.?|senior|jr\.?|junior|lead|principal|remote|hybrid)\b', '', s)
    # Remove all non-alphanumeric characters (spaces, dashes, parens, emojis)
    s = re.sub(r'[^a-z0-9]', '', s)
    return s.strip()

def compute_fingerprint(job: JobCreate) -> str:
    """
    Computes a deterministic cross-source hash to uniquely identify a job.
    Uses aggressively normalized title and company.
    """
    n_title = _normalize_string(job.title)
    n_company = _normalize_string(job.company)
    
    seed = f"{n_company}::{n_title}"
    return hashlib.sha256(seed.encode("utf-8")).hexdigest()


class Deduplicator:
    """
    Service to filter out duplicates against the database.
    """
    def __init__(self, session: AsyncSession):
        self.session = session

    async def filter_new_and_updated(self, jobs: list[JobCreate]) -> tuple[list[JobCreate], list[JobCreate]]:
        """
        Takes a list of fetched jobs and returns (new_jobs, jobs_to_update).
        """
        if not jobs:
            return [], []

        # 1. Compute fingerprints for the incoming batch
        incoming_map = {compute_fingerprint(j): j for j in jobs}
        fingerprints = list(incoming_map.keys())

        # 2. Fetch existing jobs with these fingerprints
        stmt = select(Job).where(Job.fingerprint.in_(fingerprints))
        result = await self.session.execute(stmt)
        existing_jobs = {job.fingerprint: job for job in result.scalars().all()}

        new_jobs = []
        jobs_to_update = []

        # 3. Categorize
        for fp, job_create in incoming_map.items():
            existing = existing_jobs.get(fp)
            
            if not existing:
                new_jobs.append(job_create)
            else:
                # Basic check for changes to see if we should update.
                # In a real system, you'd do a deep comparison here.
                # We'll just touch the 'last_seen_at' and update it.
                jobs_to_update.append(job_create)

        return new_jobs, jobs_to_update
