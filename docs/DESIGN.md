# Job Ingestion Platform - Design Document

## 1. Detection Surface

What gives an automated client away on a platform like LinkedIn/Indeed:

### Network Layer
- **Request frequency**: Bots make requests at unnaturally regular intervals
  (exactly every 5.000 seconds). Humans have variable timing.
- **Connection reuse patterns**: Bots often create new TCP connections per request
  instead of reusing connections like browsers do.
- **IP reputation**: Datacenter IPs are flagged; residential IPs are trusted.

### HTTP Layer
- **Missing/wrong headers**: Bots omit Accept-Language, Accept-Encoding, or
  send inconsistent User-Agent strings (e.g., Chrome UA but no sec-ch-ua headers).
- **Cookie handling**: Bots that don't store and replay cookies are trivially detected.
- **TLS fingerprint (JA3/JA4)**: Python's httpx/requests has a distinct TLS
  handshake fingerprint from real Chrome. Advanced sites check this.

### Browser Layer
- **navigator.webdriver**: Headless browsers set this to true by default.
  Playwright stealth patches this, but detection evolves.
- **Canvas/WebGL fingerprinting**: Headless browsers produce deterministic
  canvas hashes that differ from real GPUs.
- **Missing browser APIs**: Headless Chrome lacks some APIs (e.g., Bluetooth,
  USB, Gamepad) that real browsers expose.

### Behavioral Layer
- **No mouse movement**: Bots navigate without moving the mouse.
- **No scroll events**: Bots extract DOM without scrolling.
- **Instant form submission**: Bots fill forms faster than humans can type.
- **Linear navigation**: Bots go directly to data pages without visiting
  the homepage, about page, etc.

### What Our Design Accounts For
- ✅ Variable request timing (jitter in backoff)
- ✅ Proper connection reuse (httpx connection pooling)
- ✅ Standard HTTP headers including Accept-Language, Accept-Encoding
- ✅ Cookie persistence across requests (httpx cookie jar)
- ✅ Respectful rate limiting (self-imposed RPM caps)
- ✅ Retry-After header compliance
- ❌ We deliberately DO NOT attempt: IP rotation, TLS fingerprint spoofing,
  CAPTCHA solving, or behavioral mimicry. See Section 4.

---

## 2. Ingestion Strategy

We employ a source-agnostic architecture based on the **Strategy Pattern** with a **cheapest-mechanism-first** escalation path. 

### Key Principles
1. **Isolated Adapters**: Every data source (Arbeitnow, Remotive, Hacker News) implements a common `SourceAdapter` protocol. If one source blocks us or changes its markup, the rest of the ingestion pipeline remains entirely unaffected.
2. **Escalation Path**: We always start with the cheapest/safest method of extraction:
   - **Tier 1 (Safest)**: Public REST APIs (JSON data) using `httpx`. No parsing required.
   - **Tier 2 (Moderate)**: Static HTML scraping using `BeautifulSoup4` + `lxml`.
   - **Tier 3 (Nuclear)**: Headless browser automation using `Playwright` to render JavaScript SPAs. Used only when absolutely necessary to avoid overhead and detection.
3. **Pacing and Politeness**: Ingestion is paced internally using a `RateLimiter` per source adapter. We self-impose request delays rather than hammering a target until blocked.

---

## 3. Resilience

Resilience is what separates a brittle scraper from a production data pipeline. We anticipate failures (rate limits, empty responses, server downtime) and handle them gracefully using four integrated patterns:

### 1. Retry with Exponential Backoff + Jitter (`tenacity`)
When transient errors occur (HTTP 429 Too Many Requests, HTTP 503 Service Unavailable, or network timeouts), the adapter retries the request. Crucially, we add **jitter** (randomized delay) to our exponential backoff to prevent a "thundering herd" of retries from overwhelming a recovering remote server.

### 2. Circuit Breaker (`pybreaker`)
If a remote server goes down completely, retrying is a waste of our thread pool and disrespectful to their infrastructure. The Circuit Breaker wraps the adapter execution. If a source fails consecutively beyond a threshold (e.g., 3 times), the circuit "OPENS". Subsequent ingestion attempts will "fast-fail" locally without making outbound requests until a cooldown period passes, at which point it transitions to "HALF-OPEN" to test if the source recovered.

### 3. Batch Validation Gate
A silent killer of ingestion pipelines is upstream schema changes (e.g., the target site changes its JSON keys or HTML class names). Instead of polluting our database with null/broken data, our `BatchValidator` intercepts the normalized data before insertion. If >30% of the fetched jobs fail business logic validation (e.g., missing titles, broken URLs), the entire batch is REJECTED and an alert state is triggered.

### 4. Source Health State Machine
The orchestrator updates the state of every source in the database:
- **HEALTHY**: Normal operation.
- **DEGRADED**: Fetch succeeded, but there were some retries or partial invalidations.
- **DISABLED**: Automatically disabled because the Circuit Breaker is OPEN, preventing further ingestion attempts until manual intervention or cooldown.

---

## 4. Where We'd Stop

### Technical Line
- We use ONLY sources that provide public APIs or explicitly permit automated access.
- We respect `robots.txt`, rate limits, and `Retry-After` headers.
- We do **NOT**: rotate IPs, spoof browser fingerprints, solve CAPTCHAs, create fake accounts, or bypass authentication.

### Ethical Line
- Job listings are factual data, not creative works - but the platforms' investment in aggregating and structuring this data has value.
- We demonstrate the engineering patterns (resilience, parsing, fallback) against permitted sources (Arbeitnow, Remotive, Hacker News) and a controlled sandbox.
- The architecture is source-agnostic: the same adapter pattern would work if a closed platform later offered a legitimate API partnership.

### Design Philosophy
- The system is designed to **WORK WITH** sources (respecting their rate limits, backing off when asked), not to **WORK AGAINST** them.
- This represents the critical difference between building a robust resilience layer and building an evasion layer.
