.PHONY: dev test lint format migrate seed docker-up docker-down

# Start development server
dev:
	uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run all tests
test:
	pytest tests/ -v --tb=short --cov=app --cov-report=term-missing

# Run linter
lint:
	ruff check app/ tests/
	mypy app/

# Auto-format code
format:
	ruff format app/ tests/
	ruff check --fix app/ tests/

# Run database migrations
migrate:
	alembic upgrade head

# Create a new migration
migration:
	alembic revision --autogenerate -m "$(msg)"

# Seed default sources
seed:
	python -c "import asyncio; from app.database.repositories import SourceRepository; ..."

# Docker compose
docker-up:
	docker compose up -d --build

docker-down:
	docker compose down -v

# Start sandbox chaos server
sandbox:
	uvicorn sandbox.app:app --reload --host 0.0.0.0 --port 8001

# Full CI check
ci: lint test
