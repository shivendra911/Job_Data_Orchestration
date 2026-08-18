"""
Batch validation to protect the database from widespread schema changes.
"""
import structlog

from app.core.config import settings
from app.core.exceptions import ParseError
from app.models.domain import JobCreate

log = structlog.get_logger()


class BatchValidator:
    """
    Validates a batch of parsed jobs. If the percentage of invalid jobs
    exceeds the configured threshold, the entire batch is rejected.
    """

    @staticmethod
    def validate_batch(source_name: str, total_fetched: int, valid_jobs: list[JobCreate]) -> None:
        if total_fetched == 0:
            log.info("validator.empty_batch", source=source_name)
            return

        valid_count = len(valid_jobs)
        invalid_count = total_fetched - valid_count
        invalid_ratio = invalid_count / total_fetched

        log.info(
            "validator.stats",
            source=source_name,
            total=total_fetched,
            valid=valid_count,
            invalid=invalid_count,
            ratio=round(invalid_ratio, 2)
        )

        if invalid_ratio >= settings.BATCH_INVALID_THRESHOLD:
            msg = (
                f"Batch validation failed for {source_name}. "
                f"{invalid_count}/{total_fetched} ({invalid_ratio:.1%}) jobs were invalid. "
                f"Threshold is {settings.BATCH_INVALID_THRESHOLD:.1%}."
            )
            log.error("validator.batch_rejected", source=source_name, reason=msg)
            raise ParseError(msg, source=source_name, details={"invalid_ratio": invalid_ratio})
