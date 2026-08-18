import asyncio
from app.database.session import create_engine_and_session
from app.models.database import Source
from app.core.config import settings
from sqlalchemy.dialects.sqlite import insert

async def seed():
    engine, session_factory = create_engine_and_session(settings.DATABASE_URL)
    sources = [
        {"name": "arbeitnow", "adapter_type": "arbeitnow", "base_url": settings.ARBEITNOW_URL},
        {"name": "remotive", "adapter_type": "remotive", "base_url": settings.REMOTIVE_URL},
        {"name": "hn_hiring", "adapter_type": "hn_hiring", "base_url": settings.HN_ALGOLIA_URL},
        {"name": "sandbox", "adapter_type": "sandbox", "base_url": settings.SANDBOX_URL},
    ]

    async with session_factory() as session:
        for source_data in sources:
            stmt = insert(Source).values(**source_data)
            stmt = stmt.on_conflict_do_update(
                index_elements=['name'],
                set_=source_data
            )
            await session.execute(stmt)
        await session.commit()
    await engine.dispose()
    print("Database seeded with default sources.")

if __name__ == "__main__":
    asyncio.run(seed())
