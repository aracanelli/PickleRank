import time
from typing import Any, Dict, Optional

import httpx
import jwt
from jwt import PyJWKClient

from app.config import get_settings
from app.exceptions import UnauthorizedError
from app.logging_config import get_logger

logger = get_logger(__name__)

# Cache for JWKS client
_jwks_client: Optional[PyJWKClient] = None
_jwks_cache_time: float = 0
JWKS_CACHE_DURATION = 3600  # 1 hour


def get_jwks_client() -> PyJWKClient:
    """Get or create the JWKS client with caching."""
    global _jwks_client, _jwks_cache_time

    current_time = time.time()

    if _jwks_client is None or (current_time - _jwks_cache_time) > JWKS_CACHE_DURATION:
        settings = get_settings()

        if not settings.clerk_jwks_url:
            raise UnauthorizedError("JWKS URL not configured")

        _jwks_client = PyJWKClient(settings.clerk_jwks_url)
        _jwks_cache_time = current_time
        logger.info("JWKS client initialized/refreshed")

    return _jwks_client


async def verify_clerk_token(token: str) -> Dict[str, Any]:
    """
    Verify a Clerk JWT token.

    Args:
        token: The JWT token to verify

    Returns:
        The decoded token payload

    Raises:
        UnauthorizedError: If the token is invalid
    """
    settings = get_settings()

    try:
        # Get the signing key
        jwks_client = get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        # Decode and verify the token
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            issuer=settings.clerk_issuer if settings.clerk_issuer else None,
            audience=settings.clerk_audience if settings.clerk_audience else None,
            options={
                "verify_iss": bool(settings.clerk_issuer),
                "verify_aud": bool(settings.clerk_audience),
                "verify_exp": True,
            },
            leeway=60,  # Allow 60s clock skew
        )

        return payload

    except jwt.ExpiredSignatureError:
        logger.warning("Token expired")
        raise UnauthorizedError("Token has expired")
    except jwt.InvalidAudienceError:
        logger.warning("Invalid audience")
        raise UnauthorizedError("Invalid token audience")
    except jwt.InvalidIssuerError:
        logger.warning("Invalid issuer")
        raise UnauthorizedError("Invalid token issuer")
    except jwt.PyJWTError as e:
        logger.warning(f"JWT error: {e}")
        raise UnauthorizedError("Invalid token")
    except Exception as e:
        logger.error(f"Token verification error: {e}")
        raise UnauthorizedError("Token verification failed")




