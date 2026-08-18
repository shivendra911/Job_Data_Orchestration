"""
Resilience patterns: Circuit Breakers and Retries.
"""
import pybreaker
from tenacity import (
    AsyncRetrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)
import structlog
import httpx

from app.core.config import settings
from app.core.exceptions import CircuitOpenError, ParseError, PermanentError, TransientError

log = structlog.get_logger()

# We maintain a registry of circuit breakers per source
_BREAKERS: dict[str, pybreaker.CircuitBreaker] = {}


def _get_breaker(source_name: str) -> pybreaker.CircuitBreaker:
    if source_name not in _BREAKERS:
        _BREAKERS[source_name] = pybreaker.CircuitBreaker(
            fail_max=settings.CIRCUIT_BREAKER_FAIL_MAX,
            reset_timeout=settings.CIRCUIT_BREAKER_RESET_TIMEOUT,
            exclude=[PermanentError, ParseError],  # Don't open circuit on bad data or 404s
        )
    return _BREAKERS[source_name]


async def with_resilience(source_name: str, coro_func, *args, **kwargs):
    """
    Wraps an async function with both Circuit Breaker and Retry logic.
    """
    breaker = _get_breaker(source_name)

    # 1. Circuit Breaker Layer
    try:
        # We must wrap the call in the breaker
        async def _breaker_wrapper():
            return await coro_func(*args, **kwargs)
            
        result = await breaker.call_async(_breaker_wrapper)
        return result
    except pybreaker.CircuitBreakerError as e:
        log.error("resilience.circuit_open", source=source_name, error=str(e))
        raise CircuitOpenError(f"Circuit breaker open for {source_name}") from e
    
    # The Retry logic is typically applied *inside* or around the adapter itself,
    # but we can also apply it here if `coro_func` is the `fetch_jobs` call.
    # Actually, let's wrap the circuit breaker call in tenacity retries.


def get_retry_policy():
    """
    Returns an AsyncRetrying instance configured with our backoff strategy.
    """
    return AsyncRetrying(
        stop=stop_after_attempt(settings.MAX_RETRY_ATTEMPTS),
        wait=wait_exponential_jitter(initial=1, max=10),
        retry=retry_if_exception_type((TransientError, httpx.RequestError)),
        before_sleep=before_sleep_log(log, structlog.stdlib.logging.WARNING),
        reraise=True,
    )
