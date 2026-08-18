"""
Pydantic domain models for validation and serialization.
"""
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field


class JobCreate(BaseModel):
    """Data required to create or update a job from a source adapter."""
    source: str
    source_job_id: str | None = None
    title: str = Field(..., min_length=1)
    company: str = Field(..., min_length=1)
    location: str | None = None
    description: str | None = None
    employment_type: str | None = None
    salary_min: float | None = None
    salary_max: float | None = None
    salary_currency: str | None = Field(None, max_length=3)
    remote: bool | None = None
    url: str
    tags: list[str] = Field(default_factory=list)
    posted_at: datetime | None = None


class JobResponse(BaseModel):
    """Job data sent out via the API."""
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    source_id: UUID
    source_job_id: str | None
    title: str
    company: str
    location: str | None
    description: str | None
    employment_type: str | None
    salary_min: float | None
    salary_max: float | None
    salary_currency: str | None
    remote: bool | None
    url: str
    tags: list[str] | None
    posted_at: datetime | None
    first_seen_at: datetime
    last_seen_at: datetime
    is_active: bool
