"""
API Dependencies.
"""
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import create_engine_and_session
from app.core.config import settings

# Create a global engine and session factory for the FastAPI app
engine, session_factory = create_engine_and_session(settings.DATABASE_URL)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """Dependency to provide a database session per request."""
    async with session_factory() as session:
        yield session
