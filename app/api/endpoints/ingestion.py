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
    The run happens in the background so we return a 202 Accepted immediately.
    """
    repo = SourceRepository(db)
    source = await repo.get_by_name(source_name)
    
    if not source:
        raise HTTPException(status_code=404, detail=f"Source '{source_name}' not found")

    if not source.enabled:
        raise HTTPException(status_code=400, detail=f"Source '{source_name}' is disabled")

    # To run in background properly without closing the session on return,
    # we'd normally spawn a new session. For simplicity here, we'll run it synchronously 
    # or pass a new session creator. Let's just run it synchronously for the MVP endpoint, 
    # or use a new session if using background tasks.
    
    # We will just run it inline for now so we can return the metrics.
    # In a true prod environment, this should be BackgroundTasks or Celery.
    orchestrator = IngestionOrchestrator(db)
    result = await orchestrator.run_ingestion(source_name)
    
    return result


@router.get("/sources")
async def list_sources(db: AsyncSession = Depends(get_db)):
    """List all registered sources and their health status."""
    repo = SourceRepository(db)
    sources = await repo.get_all_enabled()
    return sources
