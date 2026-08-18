import asyncio
from app.database.session import create_engine_and_session
from app.models.database import Source
from app.core.config import settings

async def seed():
    engine, session_factory = create_engine_and_session(settings.DATABASE_URL)
    async with session_factory() as session:
        sources = [
            Source(name="arbeitnow", adapter_type="arbeitnow", base_url=settings.ARBEITNOW_URL),
            Source(name="remotive", adapter_type="remotive", base_url=settings.REMOTIVE_URL),
            Source(name="hn_hiring", adapter_type="hn_hiring", base_url=settings.HN_ALGOLIA_URL),
            Source(name="sandbox", adapter_type="sandbox", base_url=settings.SANDBOX_URL),
        ]
        session.add_all(sources)
        await session.commit()
    await engine.dispose()
    print("Database seeded with default sources.")

if __name__ == "__main__":
    asyncio.run(seed())
