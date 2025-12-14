import socket
from typing import Optional
from urllib.parse import urlparse

import asyncpg

from app.config import get_settings
from app.logging_config import get_logger

logger = get_logger(__name__)

_pool: Optional[asyncpg.Pool] = None


def resolve_host_to_ipv4(db_url: str) -> str:
    """Resolve the database hostname to IPv4 if possible (workaround for IPv6 issues on Windows)."""
    try:
        parsed = urlparse(db_url)
        hostname = parsed.hostname
        
        if hostname:
            # Try to resolve to IPv4
            try:
                ipv4 = socket.gethostbyname(hostname)
                # Replace hostname with IP in the URL
                new_netloc = parsed.netloc.replace(hostname, ipv4)
                new_url = parsed._replace(netloc=new_netloc).geturl()
                logger.info(f"Resolved {hostname} to IPv4: {ipv4}")
                return new_url
            except socket.gaierror:
                logger.warning(f"Could not resolve {hostname} to IPv4, using original URL")
    except Exception as e:
        logger.warning(f"URL parsing failed: {e}")
    
    return db_url


async def init_db_pool() -> asyncpg.Pool:
    """Initialize the database connection pool."""
    global _pool

    if _pool is not None:
        return _pool

    settings = get_settings()

    if not settings.supabase_db_url:
        logger.warning("No database URL configured, skipping pool initialization")
        return None

    logger.info("Initializing database connection pool...")

    # Resolve hostname to IPv4 (workaround for Windows IPv6 issues)
    db_url = resolve_host_to_ipv4(settings.supabase_db_url)

    try:
        # Note: statement_cache_size=0 is required for Supabase/pgbouncer
        # because pgbouncer in transaction mode doesn't support prepared statements
        _pool = await asyncpg.create_pool(
            db_url,
            min_size=1,
            max_size=10,
            command_timeout=30,
            # For serverless, we want shorter connection timeouts
            timeout=10,
            # Disable prepared statement caching for pgbouncer compatibility
            statement_cache_size=0,
        )
        logger.info("Database connection pool initialized")
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        logger.warning("Application will start without database connection")
        _pool = None

    return _pool


async def get_db_pool() -> asyncpg.Pool:
    """Get the database connection pool, initializing if needed."""
    global _pool

    if _pool is None:
        _pool = await init_db_pool()
        if _pool is None:
            raise RuntimeError("Database connection pool could not be initialized. Check your SUPABASE_DB_URL environment variable.")

    return _pool


async def close_db_pool() -> None:
    """Close the database connection pool."""
    global _pool

    if _pool is not None:
        logger.info("Closing database connection pool...")
        await _pool.close()
        _pool = None
        logger.info("Database connection pool closed")

