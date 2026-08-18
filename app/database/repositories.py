"""
Repository layer to abstract database access.
"""
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.database import IngestionRun, Job, RawIngestion, Source
from app.models.domain import JobCreate
from app.services.deduplicator import compute_fingerprint


class SourceRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def get_by_name(self, name: str) -> Source | None:
        stmt = select(Source).where(Source.name == name)
        result = await self.session.execute(stmt)
        return result.scalars().first()

    async def get_all_enabled(self) -> list[Source]:
        stmt = select(Source).where(Source.enabled == True)
        result = await self.session.execute(stmt)
        return list(result.scalars().all())

    async def record_success(self, source_id: UUID) -> None:
        stmt = (
            update(Source)
            .where(Source.id == source_id)
            .values(
                status="healthy",
                failure_count=0,
                last_success_at=datetime.now(timezone.utc),
            )
        )
        await self.session.execute(stmt)

    async def record_failure(self, source_id: UUID, is_circuit_open: bool = False) -> None:
        status = "circuit_open" if is_circuit_open else "degraded"
        
        source = await self.session.get(Source, source_id)
        if not source:
            return
            
        stmt = (
            update(Source)
            .where(Source.id == source_id)
            .values(
                status=status,
                failure_count=source.failure_count + 1,
                last_failure_at=datetime.now(timezone.utc),
            )
        )
        await self.session.execute(stmt)


class RunRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def create_run(self, source_id: UUID) -> IngestionRun:
        run = IngestionRun(
            source_id=source_id,
            status="running",
            started_at=datetime.now(timezone.utc),
        )
        self.session.add(run)
        return run

    async def complete_run(
        self,
        run: IngestionRun,
        status: str,
        metrics: dict,
        error: str | None = None
    ) -> None:
        now = datetime.now(timezone.utc)
        duration_ms = int((now - run.started_at).total_seconds() * 1000)

        run.status = status
        run.finished_at = now
        run.duration_ms = duration_ms
        run.error_message = error
        
        run.jobs_fetched = metrics.get("fetched", 0)
        run.jobs_valid = metrics.get("valid", 0)
        run.jobs_invalid = metrics.get("invalid", 0)
        run.jobs_new = metrics.get("new", 0)
        run.jobs_updated = metrics.get("updated", 0)
        run.jobs_duplicate = metrics.get("duplicate", 0)


class JobRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    def bulk_insert(self, source_id: UUID, new_jobs: list[JobCreate]) -> None:
        for job_in in new_jobs:
            job = Job(
                source_id=source_id,
                source_job_id=job_in.source_job_id,
                fingerprint=compute_fingerprint(job_in),
                title=job_in.title,
                company=job_in.company,
                location=job_in.location,
                description=job_in.description,
                employment_type=job_in.employment_type,
                salary_min=job_in.salary_min,
                salary_max=job_in.salary_max,
                salary_currency=job_in.salary_currency,
                remote=job_in.remote,
                url=job_in.url,
                tags=job_in.tags,
                posted_at=job_in.posted_at,
            )
            self.session.add(job)

    async def bulk_update_last_seen(self, source_id: UUID, updated_jobs: list[JobCreate]) -> None:
        if not updated_jobs:
            return
            
        fingerprints = [compute_fingerprint(j) for j in updated_jobs]
        
        # We need to fetch the existing rows to modify their tags
        stmt = select(Job).where(Job.fingerprint.in_(fingerprints))
        result = await self.session.execute(stmt)
        existing_jobs = result.scalars().all()
        
        # Build a map of fingerprint -> source_name from the incoming jobs
        incoming_sources = {compute_fingerprint(j): j.source for j in updated_jobs}
        
        for job in existing_jobs:
            job.last_seen_at = datetime.now(timezone.utc)
            job.is_active = True
            
            incoming_source_name = incoming_sources.get(job.fingerprint)
            
            # Cross-source logic
            if str(job.source_id) != str(source_id) and incoming_source_name:
                tag = f"cross-posted-{incoming_source_name}"
                current_tags = list(job.tags) if job.tags else []
                if tag not in current_tags:
                    current_tags.append(tag)
                    # In SQLAlchemy, assigning a new list triggers the JSON mutation
                    job.tags = current_tags
                    
        # the session will flush these updates automatically on commit
