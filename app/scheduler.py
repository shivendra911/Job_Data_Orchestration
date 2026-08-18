"""
APScheduler configuration for periodic ingestion.
"""
import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.interval import IntervalTrigger
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import create_engine_and_session
from app.services.orchestrator import IngestionOrchestrator

log = structlog.get_logger()

# We create a global scheduler instance
scheduler = AsyncIOScheduler()

async def scheduled_ingestion_job(source_name: str, database_url: str):
    """
    The actual job that runs on a schedule.
    It creates its own DB session, runs the orchestrator, and closes the session.
    """
    log.info("scheduler.job_started", source=source_name)
    engine, session_factory = create_engine_and_session(database_url)
    
    try:
        async with session_factory() as session:
            orchestrator = IngestionOrchestrator(session)
            await orchestrator.run_ingestion(source_name)
    except Exception as e:
        log.error("scheduler.job_failed", source=source_name, error=str(e))
    finally:
        await engine.dispose()
        log.info("scheduler.job_finished", source=source_name)


from sqlalchemy import select
from app.models.database import Source

async def setup_scheduler(database_url: str):
    """
    Wires up the scheduled jobs dynamically from the DB.
    """
    if not settings.SCHEDULER_ENABLED:
        log.info("scheduler.disabled")
        return

    engine, session_factory = create_engine_and_session(database_url)
    
    try:
        async with session_factory() as session:
            stmt = select(Source).where(Source.enabled == True)
            result = await session.execute(stmt)
            sources = result.scalars().all()
            
            for source in sources:
                interval = source.schedule_interval_minutes
                scheduler.add_job(
                    scheduled_ingestion_job,
                    trigger=IntervalTrigger(minutes=interval),
                    kwargs={"source_name": source.name, "database_url": database_url},
                    id=f"ingest_{source.name}",
                    replace_existing=True,
                    misfire_grace_time=300,
                )
            
            source_names = [s.name for s in sources]
            log.info("scheduler.configured", active_sources=source_names)
    except Exception as e:
        log.error("scheduler.setup_failed", error=str(e))
    finally:
        await engine.dispose()
