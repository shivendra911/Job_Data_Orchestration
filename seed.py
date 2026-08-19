import asyncio
from app.database.session import create_engine_and_session
from app.models.database import Source
from app.core.config import settings

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
            # Check if source exists
            from sqlalchemy import select
            stmt = select(Source).where(Source.name == source_data["name"])
            result = await session.execute(stmt)
            existing = result.scalars().first()
            
            if not existing:
                new_source = Source(**source_data)
                session.add(new_source)
            else:
                existing.base_url = source_data["base_url"]
                existing.adapter_type = source_data["adapter_type"]
        
        await session.commit()
    await engine.dispose()
    print("Database seeded with default sources.")

if __name__ == "__main__":
    asyncio.run(seed())
