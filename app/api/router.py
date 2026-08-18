"""
Main API router.
"""
from fastapi import APIRouter

from app.api.endpoints import ingestion, jobs

api_router = APIRouter()

api_router.include_router(jobs.router, prefix="/jobs", tags=["Jobs"])
api_router.include_router(ingestion.router, prefix="/ingest", tags=["Ingestion"])
