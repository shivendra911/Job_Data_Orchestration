# DECISIONS.md

## 1. Why this ingestion strategy over the obvious alternative I rejected?

I rejected building a monolithic Playwright scraper that tries to impersonate a human on LinkedIn/Indeed. Instead, I built a source-agnostic ingestion platform with the Adapter pattern:

- **Rejected**: Single-source Playwright scraper with proxy rotation. Fragile, ethically questionable, expensive to maintain, gets banned.
- **Chosen**: Multi-source adapter architecture with cheapest-mechanism-first. 
  - httpx for APIs, BS4 for HTML, Playwright only when truly needed.
  - Each source is isolated: one breaking doesn't affect others.
  - Circuit breakers and retry policies handle failures automatically.

The architecture proves the engineering patterns against real, permitted APIs (Arbeitnow, Remotive, Hacker News) and demonstrates failure resilience.

## 2. One trade-off I made under the time limit, and what I'd do with a real week

**Trade-off**: No Playwright adapter in the live demo. All three live sources (Arbeitnow, Remotive, HN) provide JSON APIs, so Playwright is unnecessary. We also migrated the deployment local testing environment to SQLite for rapid Windows iterations, sacrificing PostgreSQL-native optimizations like `JSONB`.

**With a real week**: I'd add a Playwright adapter for a source that genuinely requires browser rendering (e.g., a JavaScript-rendered job board), implement `playwright-stealth` for anti-detection, add WebSocket-based live dashboard updates instead of polling, and utilize a dedicated PostgreSQL environment for all phases of testing and production.

## 3. Where did I use AI tools, and what did I personally verify or change?

- **Architecture design**: AI proposed the adapter pattern and circuit breaker concept. I verified these against Martin Fowler's circuit breaker pattern and the Gang of Four Strategy pattern. Modified the state machine to include a DEGRADED state between HEALTHY and DISABLED.
- **Code generation**: AI generated boilerplate for FastAPI endpoints, Pydantic models, and Dockerfile. I personally wrote the ingestion orchestrator, the batch validation logic, the async state-sync implementation for `pybreaker`, and the sandbox chaos server.
- **Testing**: AI suggested test cases. I expanded them to cover edge cases I identified during manual testing (e.g., Unicode in job titles, empty salary ranges, malformed URLs).
