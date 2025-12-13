from slowapi import Limiter
from slowapi.util import get_remote_address

# Create limiter instance
limiter = Limiter(key_func=get_remote_address)

# Rate limit constants
DEFAULT_RATE = "100/minute"
STRICT_RATE = "10/minute"  # For expensive operations like matchmaking

