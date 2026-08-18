"""
FastAPI application factory.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from prometheus_client import make_asgi_app
import structlog

from app.api.router import api_router
from app.api.deps import engine
from app.core.config import settings
from app.core.logging import configure_logging
from app.scheduler import scheduler, setup_scheduler

# Ensure adapters are registered via their decorators
import app.adapters  # noqa: F401

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
    
    # Try to import CorrelationIdMiddleware, but don't crash if missing
    try:
        from asgi_correlation_id import CorrelationIdMiddleware
        has_correlation_id = True
    except ImportError:
        has_correlation_id = False
    
    app = FastAPI(
        title=settings.APP_NAME,
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
    )
    
    # --- Middleware ---
    if has_correlation_id:
        app.add_middleware(CorrelationIdMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # --- Frontend UI Routes ---
    templates = Jinja2Templates(directory="app/templates")

    @app.get("/", response_class=HTMLResponse, include_in_schema=False)
    async def dashboard_view(request: Request):
        return templates.TemplateResponse(request=request, name="dashboard.html", context={"active_page": "dashboard"})
    
    # --- Routers ---
    app.include_router(api_router, prefix="/api/v1")
    
    # --- Health Probes ---
    @app.get("/api/v1/health/live", tags=["Health"])
    async def liveness_probe():
        return {"status": "alive"}
        
    @app.get("/api/v1/health/ready", tags=["Health"])
    async def readiness_probe():
        return {"status": "ready"}
        
    # --- Prometheus Metrics ---
    metrics_app = make_asgi_app()
    app.mount("/metrics", metrics_app)
    
    # --- Static Files (mount LAST — it's a catch-all for /static/*) ---
    app.mount("/static", StaticFiles(directory="static"), name="static")
        
    return app


app = create_app()
