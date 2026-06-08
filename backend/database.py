import os
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5432/swimsecure"
)

engine = create_async_engine(DATABASE_URL, echo=False)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)

class Base(DeclarativeBase):
    pass

async def init_db():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        from models import Session, Event  # noqa: F401
        await conn.run_sync(Base.metadata.create_all)

async def get_db():
    """Dependency for FastAPI routes."""
    async with AsyncSessionLocal() as session:
        yield session
