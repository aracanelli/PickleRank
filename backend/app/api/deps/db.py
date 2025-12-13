from typing import AsyncGenerator

from asyncpg import Connection

from app.infrastructure.db.connection import get_db_pool


async def get_db() -> AsyncGenerator[Connection, None]:
    """
    Dependency to get a database connection.
    Automatically returns connection to pool after use.
    """
    pool = await get_db_pool()
    async with pool.acquire() as connection:
        yield connection

