"""
Source listing endpoints.
"""
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.models.database import Source, IngestionRun
from sqlalchemy.orm import selectinload

router = APIRouter()


@router.get("/logs")
async def get_activity_logs(db: AsyncSession = Depends(get_db)):
    """Fetch the latest scraping run logs."""
    stmt = (
        select(IngestionRun)
        .options(selectinload(IngestionRun.source))
        .order_by(IngestionRun.started_at.desc())
        .limit(10)
    )
    result = await db.execute(stmt)
    runs = result.scalars().all()
    
    logs = []
    for run in runs:
        logs.append({
            "source_name": run.source.name if run.source else "Unknown",
            "status": run.status,
            "started_at": run.started_at.isoformat(),
            "jobs_new": run.jobs_new,
            "jobs_updated": run.jobs_updated,
            "duration_ms": run.duration_ms,
            "error_message": run.error_message
        })
    return logs


@router.get("/")
async def list_sources(db: AsyncSession = Depends(get_db)):
    """List all registered sources and their health status."""
    stmt = select(Source)
    result = await db.execute(stmt)
    sources = result.scalars().all()
    return [
        {
            "id": str(s.id),
            "name": s.name,
            "adapter_type": s.adapter_type,
            "base_url": s.base_url,
            "enabled": s.enabled,
            "status": s.status,
            "last_success_at": s.last_success_at.isoformat() if s.last_success_at else None,
            "last_failure_at": s.last_failure_at.isoformat() if s.last_failure_at else None,
            "failure_count": s.failure_count,
        }
        for s in sources
    ]
