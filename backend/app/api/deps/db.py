from typing import AsyncGenerator, Optional

from asyncpg import Connection

from app.infrastructure.db.connection import get_db_pool
from app.logging_config import get_logger

logger = get_logger(__name__)


async def get_db() -> AsyncGenerator[Connection, None]:
    """
    Dependency to get a database connection.
    Automatically returns connection to pool after use.
    """
    try:
        pool = await get_db_pool()
        if pool is None:
            logger.error("Database pool is None, cannot acquire connection")
            raise RuntimeError("Database connection pool is not available")
        async with pool.acquire() as connection:
            yield connection
    except Exception as e:
        logger.error(f"Error acquiring database connection: {e}")
        raise



