"""
SourceAdapter ABC.
All ingestion adapters must implement this interface.
"""
from abc import ABC, abstractmethod
from app.models.domain import JobCreate


class SourceAdapter(ABC):
    """
    Abstract base class for all job source adapters.
    """

    @abstractmethod
    async def fetch_jobs(self) -> list[JobCreate]:
        """
        Fetch jobs from the source and normalize them into canonical JobCreate objects.
        Must raise appropriate IngestionError subclasses on failure.
        """
        pass

    @abstractmethod
    async def health_check(self) -> bool:
        """
        Quick check to verify the source is reachable.
        Should not consume significant rate limits.
        """
        pass
