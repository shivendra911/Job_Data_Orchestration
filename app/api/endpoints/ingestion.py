"""
Ingestion trigger and source endpoints.
"""
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_db
from app.database.repositories import SourceRepository
from app.services.orchestrator import IngestionOrchestrator

router = APIRouter()


@router.post("/{source_name}")
async def trigger_ingestion(
    source_name: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Manually trigger an ingestion run for a specific source.
    Runs synchronously and returns the metrics.
    """
    repo = SourceRepository(db)
    source = await repo.get_by_name(source_name)
    
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    if not source.enabled:
        raise HTTPException(status_code=400, detail=f"Source '{source_name}' is disabled")

    orchestrator = IngestionOrchestrator(db)
    result = await orchestrator.run_ingestion(source_name)
    
    return result
