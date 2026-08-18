"""
FastAPI application factory.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from prometheus_client import make_asgi_app
import structlog
from asgi_correlation_id import CorrelationIdMiddleware

from app.api.router import api_router
from app.api.deps import engine
from app.core.config import settings
from app.core.logging import configure_logging
from app.scheduler import scheduler, setup_scheduler

# Configure structured logging before app startup
configure_logging(settings.ENVIRONMENT)
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager to handle startup and shutdown events cleanly.
    """
    log.info("app.startup", message="Starting up Job Ingestion Platform")
    
    # 1. Setup APScheduler
    if settings.SCHEDULER_ENABLED:
        setup_scheduler(settings.DATABASE_URL)
        scheduler.start()
        log.info("app.startup.scheduler", message="Scheduler started")
        
    yield
    
    log.info("app.shutdown", message="Shutting down gracefully")
    
    # 1. Stop scheduler
    if settings.SCHEDULER_ENABLED:
        scheduler.shutdown()
        
    # 2. Close DB engine connections
    await engine.dispose()
    log.info("app.shutdown.complete")


def create_app() -> FastAPI:
    """Factory to create the FastAPI application."""
    
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )
    
    # --- Middleware ---
    app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # --- Routers ---
    app.include_router(api_router, prefix="/api/v1")
    
    # --- Health Probes ---
    @app.get("/api/v1/health/live", tags=["Health"])
    async def liveness_probe():
        return {"status": "alive"}
        
    @app.get("/api/v1/health/ready", tags=["Health"])
    async def readiness_probe():
        # In a real app, verify DB connection here
        return {"status": "ready"}
        
    # --- Prometheus Metrics ---
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)
    
    return app


app = create_app()
