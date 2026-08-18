# Import all adapter modules so @register_adapter decorators execute
from app.adapters import arbeitnow  # noqa: F401
from app.adapters import remotive  # noqa: F401
from app.adapters import hn_hiring  # noqa: F401
from app.adapters import sandbox  # noqa: F401
