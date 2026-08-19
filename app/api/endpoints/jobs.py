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


@router.get("/")
async def list_jobs(
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    source_id: UUID | None = None,
    remote_only: bool = False,
):
    """List and filter active job postings."""
    stmt = select(Job).options(selectinload(Job.source)).where(Job.is_active == True)
    
    if source_id:
        stmt = stmt.where(Job.source_id == source_id)
    if remote_only:
        stmt = stmt.where(Job.remote == True)
        
    stmt = stmt.order_by(Job.posted_at.desc().nulls_last()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    
    # Attach source_name for the response
    response = []
    for job in jobs:
        job_dict = JobResponse.model_validate(job).model_dump()
        job_dict["source_name"] = job.source.name if job.source else "unknown"
        response.append(job_dict)
    return response


from app.api.deps import get_current_user
from app.models.user import User, UserProfile
from sqlalchemy import or_

@router.get("/recommended")
async def recommended_jobs(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100)
):
    """Get personalized job recommendations based on user profile preferences."""
    # Fetch user profile
    stmt = select(UserProfile).where(UserProfile.user_id == current_user.id)
    result = await db.execute(stmt)
    profile = result.scalars().first()
    
    # Base query
    stmt = select(Job).options(selectinload(Job.source)).where(Job.is_active == True)
    
    if profile:
        conditions = []
        if profile.preferred_roles:
            role_conditions = [Job.title.ilike(f"%{role}%") for role in profile.preferred_roles]
            conditions.append(or_(*role_conditions))
            
        if profile.preferred_locations:
            loc_conditions = [Job.location.ilike(f"%{loc}%") for loc in profile.preferred_locations]
            conditions.append(or_(*loc_conditions))
            
        if profile.target_salary:
            conditions.append(Job.salary_min >= profile.target_salary)
            
        if conditions:
            # For recommendations, we match ANY of the conditions (OR)
            stmt = stmt.where(or_(*conditions))
            
    stmt = stmt.order_by(Job.posted_at.desc().nulls_last()).offset(skip).limit(limit)
    
    result = await db.execute(stmt)
    jobs = result.scalars().all()
    
    response = []
    for job in jobs:
        job_dict = JobResponse.model_validate(job).model_dump()
        job_dict["source_name"] = job.source.name if job.source else "unknown"
        response.append(job_dict)
    return response



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
