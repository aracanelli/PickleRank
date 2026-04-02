"""
Shared fixtures for integration tests.

Provides a FastAPI TestClient with mocked database and auth dependencies
so tests can exercise HTTP endpoints without real Supabase/Clerk.
"""

from typing import AsyncGenerator
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

TEST_USER_ID = str(uuid4())
TEST_CLERK_USER_ID = "clerk_test_user_123"


@pytest.fixture()
def fake_user() -> CurrentUser:
    """Return a deterministic authenticated user."""
    return CurrentUser(user_id=TEST_USER_ID, clerk_user_id=TEST_CLERK_USER_ID)


@pytest.fixture()
def fake_db() -> AsyncMock:
    """Return a mock asyncpg connection.

    Tests should configure return values like:
        fake_db.fetchrow.return_value = {"id": ..., "name": ...}
        fake_db.fetch.return_value = [row1, row2]
    """
    conn = AsyncMock()
    conn.fetch.return_value = []
    conn.fetchrow.return_value = None
    conn.fetchval.return_value = None
    conn.execute.return_value = "OK"
    return conn


@pytest.fixture()
def client(fake_user, fake_db) -> TestClient:
    """Create a TestClient with auth and db dependencies overridden."""
    from app.main import create_app

    app = create_app()

    async def _override_auth():
        return fake_user

    async def _override_db() -> AsyncGenerator:
        yield fake_db

    app.dependency_overrides[get_current_user] = _override_auth
    app.dependency_overrides[get_db] = _override_db

    with TestClient(app, raise_server_exceptions=False) as c:
        yield c

    app.dependency_overrides.clear()
