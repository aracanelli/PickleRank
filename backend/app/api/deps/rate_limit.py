from slowapi import Limiter
from slowapi.util import get_remote_address

# Rate limit constants
DEFAULT_RATE = "100/minute"
STRICT_RATE = "10/minute"   # For expensive operations like matchmaking, CSV import
AUTH_RATE = "5/15minutes"   # For authentication-sensitive operations (invite/link tokens)

# Create limiter with global default so uncovered endpoints are still protected
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[DEFAULT_RATE],
)







