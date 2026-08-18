"""
Registry for source adapters.
"""
from app.adapters.base import SourceAdapter


_ADAPTERS: dict[str, type[SourceAdapter]] = {}


def register_adapter(name: str):
    """Decorator to register an adapter class."""
    def wrapper(cls: type[SourceAdapter]):
        _ADAPTERS[name] = cls
        return cls
    return wrapper


def get_adapter(name: str, config: dict | None = None) -> SourceAdapter:
    """Instantiate and return the adapter for the given source name."""
    cls = _ADAPTERS.get(name)
    if not cls:
        raise ValueError(f"No adapter registered for source: {name}")
    
    kwargs = config or {}
    return cls(**kwargs)
