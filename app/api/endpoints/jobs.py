"""
Job endpoints.
"""
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.api.deps import get_db
from app.models.database import Job
from app.models.domain import JobResponse

router = APIRouter()


@router.get("/", response_model=list[JobResponse])
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    source_id: UUID | None = None,
    remote_only: bool = False,
):
    """List and filter active job postings."""
    stmt = select(Job).where(Job.is_active == True)
    
    if source_id:
        stmt = stmt.where(Job.source_id == source_id)
    if remote_only:
        stmt = stmt.where(Job.remote == True)
        
    stmt = stmt.order_by(Job.posted_at.desc().nulls_last()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific job by ID."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
