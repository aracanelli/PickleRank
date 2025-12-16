from typing import Optional

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.exceptions import UnauthorizedError
from app.infrastructure.auth.clerk_jwt import verify_clerk_token
from app.logging_config import get_logger

logger = get_logger(__name__)

security = HTTPBearer(auto_error=False)


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

        # Get or create internal user ID
        from app.infrastructure.db.connection import get_db_pool

        pool = await get_db_pool()
        
        if pool is None:
            logger.error("Database pool not available")
            raise UnauthorizedError("Service temporarily unavailable")
        
        async with pool.acquire() as conn:
            # Upsert user and get internal ID
            row = await conn.fetchrow(
                """
                INSERT INTO users (clerk_user_id)
                VALUES ($1)
                ON CONFLICT (clerk_user_id) DO UPDATE SET clerk_user_id = EXCLUDED.clerk_user_id
                RETURNING id
                """,
                clerk_user_id,
            )
            if row is None:
                logger.error(f"Failed to upsert user with clerk_user_id: {clerk_user_id}")
                raise UnauthorizedError("Failed to create or retrieve user")
            user_id = str(row["id"])

        return CurrentUser(user_id=user_id, clerk_user_id=clerk_user_id)

    except UnauthorizedError:
        raise
    except Exception as e:
        logger.error(f"Auth error: {e}", exc_info=True)
        raise UnauthorizedError("Authentication failed")


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

