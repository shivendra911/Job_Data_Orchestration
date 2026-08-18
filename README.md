# Job Ingestion Platform

A production-grade, source-agnostic job listing ingestion system that demonstrates
resilience patterns, structured observability, and clean architecture.

## Live Demo

🔗 **Deployed URL**: [https://job-ingestion-api.onrender.com](https://job-ingestion-api.onrender.com)

> Note: Free tier — first request may take ~30 seconds as the service wakes up.

## Architecture

The system ingests job listings from multiple sources through a pluggable adapter
layer, normalizes them into a canonical schema, deduplicates using content
fingerprinting, and serves them through a paginated REST API.

### Key Features
- **3 real data sources**: Arbeitnow, Remotive, HN Who's Hiring
- **Chaos sandbox**: Controllable failure injection for resilience demos
- **Circuit breaker**: Per-source failure isolation (pybreaker)
- **Retry with backoff**: Exponential backoff + jitter (tenacity)
- **Batch validation**: Rejects corrupted batches (>30% invalid = reject)
- **Structured logging**: JSON logs with canonical log lines (structlog)
- **Prometheus metrics**: Counters, histograms, gauges at `/metrics`
- **Monitoring dashboard**: Real-time pipeline health visualization

## Quick Start

```bash
# Clone
git clone https://github.com/YOUR_USERNAME/job-ingestion-platform.git
cd job-ingestion-platform

# Copy environment file
cp .env.example .env

# Start services (PostgreSQL + app + sandbox)
docker compose up -d

# Run migrations
make migrate

# Open dashboard
open http://localhost:8000

# Open API docs
open http://localhost:8000/api/docs
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/jobs` | Paginated job listing with filters |
| GET | `/api/v1/jobs/{id}` | Single job detail |
| GET | `/api/v1/sources` | All sources with health status |
| GET | `/api/v1/sources/{id}/runs` | Ingestion history for a source |
| POST | `/api/v1/ingest/{source}` | Manually trigger ingestion |
| GET | `/api/v1/health/live` | Liveness probe |
| GET | `/api/v1/health/ready` | Readiness probe |
| GET | `/metrics` | Prometheus metrics |

## Tech Stack

Python 3.12 · FastAPI · SQLAlchemy 2.0 · PostgreSQL (Neon) · httpx ·
Pydantic v2 · APScheduler · tenacity · pybreaker · structlog ·
prometheus-client · Docker · GitHub Actions

## Testing

```bash
make test          # Run all tests
make lint          # Ruff + mypy
make ci            # Full CI check
```

## License

MIT
