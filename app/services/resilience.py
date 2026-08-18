"""
Resilience patterns: Circuit Breakers and Retries.
"""
import logging

import httpx
import pybreaker
import structlog
from tenacity import (
    AsyncRetrying,
    before_sleep_log,
    retry_if_exception_type,
    stop_after_attempt,
    wait_exponential_jitter,
)

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
            exclude=[PermanentError, ParseError],
        )
    return _BREAKERS[source_name]


async def with_resilience(source_name: str, coro_func, *args, **kwargs):
    """
    Wraps an async function call with a Circuit Breaker.
    """
    breaker = _get_breaker(source_name)

    # Fast-fail if open
    if breaker.current_state == "open":
        raise CircuitOpenError(f"Circuit breaker open for {source_name}")

    try:
        result = await coro_func(*args, **kwargs)
        # Register success in breaker
        breaker.call(lambda: None)
        return result
    except Exception as e:
        # Check exclusions
        if any(isinstance(e, ex) for ex in breaker._excluded_exceptions):
            raise
        
        # Register failure in breaker
        def _fail():
            raise e
        try:
            breaker.call(_fail)
        except Exception:
            pass
        raise


def get_retry_policy():
    """
    Returns an AsyncRetrying instance configured with our backoff strategy.
    Uses standard logging module for before_sleep_log compatibility.
    """
    stdlib_logger = logging.getLogger("tenacity.retry")
    return AsyncRetrying(
        stop=stop_after_attempt(settings.MAX_RETRY_ATTEMPTS),
        wait=wait_exponential_jitter(initial=1, max=10),
        retry=retry_if_exception_type((TransientError, httpx.RequestError)),
        before_sleep=before_sleep_log(stdlib_logger, logging.WARNING),
        reraise=True,
    )
