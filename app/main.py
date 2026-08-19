"""
FastAPI application factory.
"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
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
        await setup_scheduler(settings.DATABASE_URL)
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
    
    # --- Static Files and Templates ---
    from fastapi.staticfiles import StaticFiles
    from fastapi.templating import Jinja2Templates
    
    app.mount("/static", StaticFiles(directory="static"), name="static")
    templates = Jinja2Templates(directory="app/templates")
    
    @app.get("/", include_in_schema=False)
    async def root(request: Request):
        return templates.TemplateResponse(request=request, name="landing.html", context={"request": request, "active_page": "home"})

    @app.get("/search", include_in_schema=False)
    async def search(request: Request):
        return templates.TemplateResponse(request=request, name="search.html", context={"request": request, "active_page": "search"})

    @app.get("/system", include_in_schema=False)
    async def system(request: Request):
        return templates.TemplateResponse(request=request, name="system.html", context={"request": request, "active_page": "system"})

    @app.get("/docs", include_in_schema=False)
    async def docs(request: Request):
        return templates.TemplateResponse(request=request, name="docs.html", context={"request": request, "active_page": "docs"})

    @app.get("/app", include_in_schema=False)
    async def app_dashboard(request: Request):
        return templates.TemplateResponse(request=request, name="dashboard.html", context={"request": request, "active_page": "dashboard"})
        
    return app


app = create_app()
