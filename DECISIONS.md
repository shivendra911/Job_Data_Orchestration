# Architecture & Technical Decisions

This document serves as the primary artifact for explaining and defending the engineering decisions made in the Job Ingestion Platform.

## 1. Why FastAPI?
- Native asynchronous support (`async`/`await`), crucial for high-throughput I/O bound tasks like fetching data from multiple remote APIs.
- Built-in data validation and serialization via Pydantic.
- Excellent developer experience and automatic OpenAPI documentation.

## 2. Why PostgreSQL + asyncpg (and Neon)?
- **PostgreSQL**: Industry standard, robust, supports JSONB for unstructured payload storage, and handles large analytical queries well.
- **asyncpg**: The fastest async PostgreSQL driver for Python.
- **Neon Serverless**: The platform detects if it's running on Neon (via `DATABASE_URL`) and swaps the connection pooler to `NullPool`. Neon manages pooling at the proxy layer (pgbouncer), so client-side pooling causes connection exhaustion and transaction state errors.

## 3. Why `expire_on_commit=False`?
In SQLAlchemy's async extension, lazy loading relationships after a transaction commits is prohibited (because it would require implicit blocking I/O). Setting this prevents `DetachedInstanceError` when accessing model attributes after returning from the repository layer. We use `selectinload` for eager loading where necessary.

## 4. Resilience Architecture
- **tenacity**: Implements exponential backoff with jitter for transient errors (e.g., rate limits, temporary network blips). Jitter prevents the "thundering herd" problem when systems recover.
- **pybreaker**: Circuit breakers prevent cascading failures. If a source goes down completely, the circuit opens, failing fast without waiting for timeouts on every request. This protects our system's thread pool and respects the remote server's downtime.

## 5. Batch Validation
Data ingestion pipelines often fail silently when the source API changes its schema. The `BatchValidator` computes the invalidity ratio of a batch. If >30% of jobs fail to parse, the entire batch is rejected. This prevents polluting the database with partial or broken data during an upstream schema change.

## 6. Deduplication Strategy
Jobs don't always have stable IDs across platforms. The platform uses a deterministic SHA-256 fingerprint:
- `source_name + source_job_id` (if available)
- `source_name + title + company + location` (if no stable ID exists)
This allows idempotency without complex text similarity algorithms.

## 7. Canonical Log Lines
Instead of logging 50 lines per ingestion run, we use `structlog` to emit a single, JSON-formatted "canonical log line" at the end of the run containing all metadata (duration, jobs fetched, valid, duplicates). This makes querying in Datadog/Splunk extremely efficient.
