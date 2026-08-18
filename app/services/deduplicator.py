"""
Deduplication logic and fingerprinting for jobs.
"""
import hashlib

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.database import Job
from app.models.domain import JobCreate


def compute_fingerprint(job: JobCreate) -> str:
    """
    Computes a deterministic hash to uniquely identify a job.
    Uses source + source_job_id if available, otherwise falls back to
    source + title + company + location.
    """
    if job.source_job_id:
        seed = f"{job.source}::{job.source_job_id}".lower()
    else:
        seed = f"{job.source}::{job.title}::{job.company}::{job.location}".lower()

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
