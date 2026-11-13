"""Auth must not hit the database on every request once a user's internal id is known."""
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from fastapi.security import HTTPAuthorizationCredentials

from app.api.deps import auth


class _Pool:
    def __init__(self, conn):
        self.conn = conn
        self.acquired = 0

    @asynccontextmanager
    async def acquire(self):
        self.acquired += 1
        yield self.conn


@pytest.fixture()
def setup(monkeypatch):
    monkeypatch.setattr(auth, "_USER_ID_CACHE", {})
    conn = AsyncMock()
    pool = _Pool(conn)
    monkeypatch.setattr("app.infrastructure.db.connection.get_db_pool", AsyncMock(return_value=pool))
    sub = f"user_{uuid4().hex}"
    monkeypatch.setattr(auth, "verify_clerk_token", AsyncMock(return_value={"sub": sub}))
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials="t")
    return conn, pool, creds


@pytest.mark.asyncio
async def test_existing_user_is_selected_once_then_served_from_cache(setup):
    conn, pool, creds = setup
    uid = uuid4()
    conn.fetchval.return_value = uid

    first = await auth.get_current_user(request=None, credentials=creds)
    second = await auth.get_current_user(request=None, credentials=creds)

    assert first.user_id == second.user_id == str(uid)
    assert pool.acquired == 1
    conn.fetchval.assert_awaited_once()  # SELECT only, no upsert
    assert "SELECT id FROM users" in conn.fetchval.await_args.args[0]


@pytest.mark.asyncio
async def test_new_user_is_inserted_when_absent(setup):
    conn, _pool, creds = setup
    uid = uuid4()
    conn.fetchval.side_effect = [None, uid]

    user = await auth.get_current_user(request=None, credentials=creds)

    assert user.user_id == str(uid)
    assert "INSERT INTO users" in conn.fetchval.await_args.args[0]


@pytest.mark.asyncio
async def test_cache_is_bounded(setup, monkeypatch):
    conn, _pool, creds = setup
    monkeypatch.setattr(auth, "_USER_ID_CACHE_MAX", 2)
    conn.fetchval.return_value = uuid4()
    for i in range(3):
        monkeypatch.setattr(auth, "verify_clerk_token", AsyncMock(return_value={"sub": f"u{i}"}))
        await auth.get_current_user(request=None, credentials=creds)
    assert list(auth._USER_ID_CACHE) == ["u1", "u2"]
