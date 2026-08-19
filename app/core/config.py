"""
Centralized configuration using pydantic-settings.

Reads from:
  1. Environment variables (highest priority)
  2. .env file (if present)
  3. Default values (lowest priority)
"""
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # --- App ---
    ENVIRONMENT: str = "development"
    APP_NAME: str = "job-ingestion-platform"
    DEBUG: bool = False

    # --- Database ---
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/jobingestion"
    
    @field_validator("DATABASE_URL", mode="before")
    def assemble_db_connection(cls, v: str | None) -> str:
        """Ensure Render/Heroku standard postgres:// URLs are converted to use the async driver"""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            elif v.startswith("postgresql://") and not v.startswith("postgresql+asyncpg://"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v or "sqlite+aiosqlite:///./jobingestion.db"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10
    DB_ECHO: bool = False

    # --- API ---
    API_RATE_LIMIT: str = "100/minute"
    CORS_ORIGINS: list[str] = ["*"]

    # --- Ingestion ---
    SCHEDULER_ENABLED: bool = True
    INGESTION_INTERVAL_MINUTES: int = 60
    BATCH_INVALID_THRESHOLD: float = 0.30
    DEFAULT_RATE_LIMIT_RPM: int = 12
    HTTP_TIMEOUT_SECONDS: float = 30.0
    MAX_RETRY_ATTEMPTS: int = 4
    CIRCUIT_BREAKER_FAIL_MAX: int = 3
    CIRCUIT_BREAKER_RESET_TIMEOUT: int = 120

    # --- Sandbox ---
    SANDBOX_URL: str = "http://localhost:8001"

    # --- Source URLs ---
    ARBEITNOW_URL: str = "https://www.arbeitnow.com/api/job-board-api"
    REMOTIVE_URL: str = "https://remotive.com/api/remote-jobs"
    HN_ALGOLIA_URL: str = "https://hn.algolia.com/api/v1"

settings = Settings()
