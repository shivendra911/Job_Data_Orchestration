"""
Error taxonomy for the ingestion pipeline.
"""

class IngestionError(Exception):
    def __init__(self, message: str, source: str | None = None, details: dict | None = None):
        self.source = source
        self.details = details or {}
        super().__init__(message)


class TransientError(IngestionError):
    pass


class PermanentError(IngestionError):
    pass


class ParseError(IngestionError):
    pass


class CircuitOpenError(IngestionError):
    pass


def classify_http_error(status_code: int, source: str) -> IngestionError:
    if status_code == 429:
        return TransientError(f"Rate limited by {source}", source=source, details={"http_status": status_code})
    elif status_code in (502, 503, 504):
        return TransientError(f"Server error from {source}: {status_code}", source=source, details={"http_status": status_code})
    elif status_code in (401, 403):
        return PermanentError(f"Auth error from {source}: {status_code}", source=source, details={"http_status": status_code})
    elif status_code == 404:
        return PermanentError(f"Not found on {source}: endpoint may have been removed", source=source, details={"http_status": status_code})
    else:
        return TransientError(f"Unexpected HTTP {status_code} from {source}", source=source, details={"http_status": status_code})
