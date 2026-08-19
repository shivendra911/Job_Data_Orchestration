from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel

from app.api.deps import get_db, get_current_user
from app.models.user import User, UserProfile, SavedJob
from app.models.database import Job

router = APIRouter()

class UserPreferencesUpdate(BaseModel):
    preferred_roles: Optional[List[str]] = None
    preferred_locations: Optional[List[str]] = None
    target_salary: Optional[int] = None

class UserProfileResponse(BaseModel):
    email: str
    preferred_roles: List[str]
    preferred_locations: List[str]
    target_salary: Optional[int]

@router.get("/me", response_model=UserProfileResponse)
async def read_user_me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(UserProfile).where(UserProfile.user_id == current_user.id)
    result = await db.execute(stmt)
    profile = result.scalars().first()
    
    return {
        "email": current_user.email,
        "preferred_roles": profile.preferred_roles or [],
        "preferred_locations": profile.preferred_locations or [],
        "target_salary": profile.target_salary
    }

@router.put("/me/preferences")
async def update_user_preferences(
    prefs: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    stmt = select(UserProfile).where(UserProfile.user_id == current_user.id)
    result = await db.execute(stmt)
    profile = result.scalars().first()
    
    if profile is None:
        profile = UserProfile(user_id=current_user.id)
        db.add(profile)
        
    if prefs.preferred_roles is not None:
        profile.preferred_roles = prefs.preferred_roles
    if prefs.preferred_locations is not None:
        profile.preferred_locations = prefs.preferred_locations
    if prefs.target_salary is not None:
        profile.target_salary = prefs.target_salary
        
    await db.commit()
    return {"status": "success"}

@router.get("/me/saved_jobs")
async def get_saved_jobs(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(SavedJob).where(SavedJob.user_id == current_user.id).options(selectinload(SavedJob.job))
    result = await db.execute(stmt)
    saved_jobs = result.scalars().all()
    
    # Return in the same format as regular jobs
    return [
        {
            "id": str(sj.job.id),
            "title": sj.job.title,
            "company": sj.job.company,
            "location": sj.job.location,
            "url": sj.job.url,
            "salary_min": sj.job.salary_min,
            "salary_max": sj.job.salary_max,
            "tags": sj.job.tags,
            "posted_at": sj.job.posted_at.isoformat() if sj.job.posted_at else None,
            "source_name": sj.job.source_id # Simple approximation
        }
        for sj in saved_jobs if sj.job
    ]

@router.post("/me/saved_jobs/{job_id}")
async def save_job(job_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    # Check if job exists
    stmt = select(Job).where(Job.id == job_id)
    result = await db.execute(stmt)
    if not result.scalars().first():
        raise HTTPException(status_code=404, detail="Job not found")
        
    # Check if already saved
    stmt = select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id)
    result = await db.execute(stmt)
    if result.scalars().first():
        return {"status": "already_saved"}
        
    saved_job = SavedJob(user_id=current_user.id, job_id=job_id)
    db.add(saved_job)
    await db.commit()
    return {"status": "success"}

@router.delete("/me/saved_jobs/{job_id}")
async def unsave_job(job_id: str, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    stmt = select(SavedJob).where(SavedJob.user_id == current_user.id, SavedJob.job_id == job_id)
    result = await db.execute(stmt)
    saved_job = result.scalars().first()
    
    if saved_job:
        await db.delete(saved_job)
        await db.commit()
    return {"status": "success"}
