from typing import Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.exceptions import UnauthorizedError
from app.infrastructure.auth.clerk_jwt import verify_clerk_token
from app.logging_config import get_logger

logger = get_logger(__name__)

security = HTTPBearer(auto_error=False)

# clerk_user_id -> internal users.id; the mapping never changes once created.
_USER_ID_CACHE: dict[str, str] = {}
_USER_ID_CACHE_MAX = 1000


class CurrentUser:
    """Represents the currently authenticated user."""

    def __init__(self, user_id: str, clerk_user_id: str):
        self.user_id = user_id
        self.clerk_user_id = clerk_user_id


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> CurrentUser:
    """
    Dependency to get the current authenticated user.
    Verifies the Clerk JWT and returns user information.
    """
    if not credentials:
        raise UnauthorizedError("Authorization header missing")

    token = credentials.credentials

    try:
        payload = await verify_clerk_token(token)
        clerk_user_id = payload.get("sub")

        if not clerk_user_id:
            raise UnauthorizedError("Invalid token: missing subject")

        user_id = _USER_ID_CACHE.get(clerk_user_id)
        if user_id is None:
            user_id = await _get_or_create_user_id(clerk_user_id)
            if len(_USER_ID_CACHE) >= _USER_ID_CACHE_MAX:
                _USER_ID_CACHE.pop(next(iter(_USER_ID_CACHE)))  # evict oldest
            _USER_ID_CACHE[clerk_user_id] = user_id

        return CurrentUser(user_id=user_id, clerk_user_id=clerk_user_id)

    except UnauthorizedError:
        raise
    except Exception as e:
        logger.error(f"Auth error: {e}", exc_info=True)
        raise UnauthorizedError("Authentication failed")


async def _get_or_create_user_id(clerk_user_id: str) -> str:
    """Look up the internal user id, inserting the user only if absent (cache misses only)."""
    from app.infrastructure.db.connection import get_db_pool

    pool = await get_db_pool()

    if pool is None:
        logger.error("Database pool not available")
        raise UnauthorizedError("Service temporarily unavailable")

    async with pool.acquire() as conn:
        user_id = await conn.fetchval("SELECT id FROM users WHERE clerk_user_id = $1", clerk_user_id)
        if user_id is None:
            # Upsert so a concurrent first request for the same user can't fail
            user_id = await conn.fetchval(
                """
                INSERT INTO users (clerk_user_id)
                VALUES ($1)
                ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
                RETURNING id
                """,
                clerk_user_id,
            )
        if user_id is None:
            logger.error(f"Failed to upsert user with clerk_user_id: {clerk_user_id}")
            raise UnauthorizedError("Failed to create or retrieve user")
        return str(user_id)


async def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> Optional[CurrentUser]:
    """
    Dependency to optionally get the current user.
    Returns None if not authenticated instead of raising an error.
    """
    if not credentials:
        return None

    try:
        return await get_current_user(credentials=credentials, request=None)
    except UnauthorizedError:
        return None

