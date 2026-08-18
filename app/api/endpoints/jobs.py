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


import csv
import io
from fastapi.responses import StreamingResponse

@router.get("/export/csv", tags=["Export"])
async def export_jobs_csv(db: AsyncSession = Depends(get_db)):
    """Export all active jobs as a CSV file."""
    stmt = select(Job).where(Job.is_active == True).order_by(Job.posted_at.desc().nulls_last())
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(["ID", "Title", "Company", "Remote", "URL", "Salary Min", "Salary Max", "Currency", "Location", "Posted At"])
    
    for job in jobs:
        writer.writerow([
            str(job.id),
            job.title,
            job.company,
            str(job.remote),
            job.url,
            str(job.salary_min) if job.salary_min else "",
            str(job.salary_max) if job.salary_max else "",
            job.salary_currency or "",
            job.location or "",
            str(job.posted_at) if job.posted_at else ""
        ])
        
    output.seek(0)
    
    return StreamingResponse(
        iter([output.getvalue()]), 
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=jobs_export.csv"}
    )

import json

@router.get("/export/json", tags=["Export"])
async def export_jobs_json(db: AsyncSession = Depends(get_db)):
    """Export all active jobs as a JSON file."""
    stmt = select(Job).where(Job.is_active == True).order_by(Job.posted_at.desc().nulls_last())
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    
    # We can serialize using Pydantic models directly or simple dict comprehension
    jobs_data = [JobResponse.model_validate(job).model_dump(mode='json') for job in jobs]
    
    return StreamingResponse(
        iter([json.dumps(jobs_data, indent=2)]),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=jobs_export.json"}
    )

@router.get("/{job_id}", response_model=JobResponse)
async def get_job(job_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a specific job by ID."""
    job = await db.get(Job, job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job
