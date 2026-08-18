"""
The central ingestion orchestrator.
"""
import time
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.adapters.registry import get_adapter
from app.database.repositories import JobRepository, RunRepository, SourceRepository
from app.services.deduplicator import Deduplicator
from app.services.validator import BatchValidator

log = structlog.get_logger()


class IngestionOrchestrator:
    """
    Coordinates the entire ingestion flow for a single source.
    - Resolves the adapter
    - Creates a run record
    - Fetches data
    - Validates batch thresholds
    - Deduplicates against DB
    - Persists results
    """

    def __init__(self, session: AsyncSession):
        self.session = session
        self.source_repo = SourceRepository(session)
        self.run_repo = RunRepository(session)
        self.job_repo = JobRepository(session)
        self.dedup = Deduplicator(session)

    async def run_ingestion(self, source_name: str) -> dict:
        start_time = time.time()
        
        # 1. Look up source
        source = await self.source_repo.get_by_name(source_name)
        if not source:
            log.error("orchestrator.source_not_found", source=source_name)
            raise ValueError(f"Source '{source_name}' not found in database")

        if not source.enabled:
            log.info("orchestrator.source_disabled", source=source_name)
            return {"status": "skipped", "reason": "disabled"}

        # 2. Get adapter
        adapter = get_adapter(source.adapter_type, source.config_json)

        # 3. Create run record
        run = self.run_repo.create_run(source.id)
        await self.session.commit()  # commit to get the ID

        metrics = {
            "fetched": 0,
            "valid": 0,
            "invalid": 0,
            "new": 0,
            "updated": 0,
            "duplicate": 0,
        }

        from app.services.resilience import get_retry_policy, with_resilience
        
        try:
            # 4. Fetch with resilience (circuit breaker + retries)
            log.info("orchestrator.fetching", source=source.name, run_id=str(run.id))
            
            retry_policy = get_retry_policy()
            
            async for attempt in retry_policy:
                with attempt:
                    parsed_jobs = await with_resilience(
                        source.name, 
                        adapter.fetch_jobs
                    )
            
            # Note: We are simulating that the adapter itself returned parsed/valid jobs.
            # If the adapter dropped some invalid ones, we assume it logged it.
            # For this simple implementation, fetched == valid.
            metrics["fetched"] = len(parsed_jobs)
            metrics["valid"] = len(parsed_jobs)

            # 5. Validate batch
            BatchValidator.validate_batch(source.name, metrics["fetched"], parsed_jobs)

            # 6. Deduplicate
            new_jobs, updated_jobs = await self.dedup.filter_new_and_updated(parsed_jobs)
            metrics["new"] = len(new_jobs)
            metrics["updated"] = len(updated_jobs)
            metrics["duplicate"] = metrics["valid"] - (metrics["new"] + metrics["updated"])

            # 7. Persist
            if new_jobs:
                self.job_repo.bulk_insert(source.id, new_jobs)
            if updated_jobs:
                await self.job_repo.bulk_update_last_seen(source.id, updated_jobs)

            # 8. Mark success
            await self.run_repo.complete_run(run, "success", metrics)
            await self.source_repo.record_success(source.id)
            
            await self.session.commit()
            
            duration = round(time.time() - start_time, 2)
            log.info(
                "orchestrator.success",
                source=source.name,
                run_id=str(run.id),
                new=metrics["new"],
                updated=metrics["updated"],
                duration=duration
            )
            return {"status": "success", "metrics": metrics}

        except Exception as e:
            await self.session.rollback()
            
            # Log failure and update run
            log.exception("orchestrator.failed", source=source.name, error=str(e))
            
            run = await self.session.merge(run)
            await self.run_repo.complete_run(run, "failed", metrics, error=str(e))
            await self.source_repo.record_failure(source.id)
            
            await self.session.commit()
            raise
