"""
Simple TTL cache for expensive operations in serverless environment.

This module provides a lightweight in-memory cache with TTL support,
suitable for caching frequently accessed data like rankings.
"""

import asyncio
from datetime import datetime, timedelta
from typing import Any, Dict, Optional, Tuple

class TTLCache:
    """
    Simple TTL (Time-To-Live) cache for caching expensive database operations.
    
    Async-task-safe via asyncio.Lock (single event loop). Designed for serverless where external
    caching (Redis) adds latency and complexity.
    
    Usage:
        cache = TTLCache(default_ttl=30)
        
        # Get cached value
        cached = await cache.get("rankings:group-id")
        if cached:
            return cached
        
        # Compute and cache
        result = await expensive_db_query()
        await cache.set("rankings:group-id", result)
    """    
    def __init__(self, default_ttl: int = 30):
        """
        Initialize cache with default TTL in seconds.
        
        Args:
            default_ttl: Default time-to-live for cached items (seconds)
        """
        self._cache: Dict[str, Tuple[Any, datetime]] = {}
        self._default_ttl = default_ttl
        self._lock = asyncio.Lock()
    
    async def get(self, key: str) -> Optional[Any]:
        """
        Get a cached value by key.
        
        Returns None if key doesn't exist or has expired.
        Automatically cleans up expired entries.
        """
        async with self._lock:
            if key in self._cache:
                data, expires = self._cache[key]
                if datetime.now() < expires:
                    return data
                # Clean up expired entry
                del self._cache[key]
            return None
    
    async def set(self, key: str, value: Any, ttl: Optional[int] = None) -> None:
        """
        Set a cached value with optional custom TTL.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl: Optional TTL override (seconds), uses default if not provided
        """
        async with self._lock:
            expires = datetime.now() + timedelta(seconds=ttl or self._default_ttl)
            self._cache[key] = (value, expires)
    
    async def invalidate(self, pattern: Optional[str] = None) -> int:
        """
        Invalidate cache entries matching a pattern.
        
        Args:
            pattern: String pattern to match (substring match). 
                     If None, clears entire cache.
        
        Returns:
            Number of entries invalidated
        """
        async with self._lock:
            if pattern is None:
                count = len(self._cache)
                self._cache.clear()
                return count
            
            keys_to_delete = [k for k in self._cache if pattern in k]
            for k in keys_to_delete:
                del self._cache[k]
            return len(keys_to_delete)
    
    async def cleanup(self) -> int:
        """
        Remove all expired entries.
        
        Returns:
            Number of entries removed
        """
        async with self._lock:
            now = datetime.now()
            expired = [k for k, (_, exp) in self._cache.items() if exp <= now]
            for k in expired:
                del self._cache[k]
            return len(expired)


# Global cache instances for different data types
# Rankings: 30 second TTL (frequently accessed, rarely changes)
rankings_cache = TTLCache(default_ttl=30)

# Player stats: 60 second TTL (accessed on profile pages)
player_stats_cache = TTLCache(default_ttl=60)

# Group details: 30 second TTL
group_cache = TTLCache(default_ttl=30)
