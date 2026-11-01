"""Regression tests for event attendance charging."""
from uuid import uuid4

import pytest

from app.infrastructure.repositories.payments_repo import PaymentsRepository


class _PaymentConnection:
    def __init__(self, group_player_id):
        self.group_player_id = group_player_id
        self.inserted = False
        self.insert_queries = []

    async def fetch(self, query, event_id):
        return [{"group_player_id": self.group_player_id}]

    async def fetchval(self, query, event_id, group_player_id):
        return None

    async def fetchrow(self, query, *args):
        self.insert_queries.append(query)
        if self.inserted:
            return None  # PostgreSQL's ON CONFLICT DO NOTHING behavior.
        self.inserted = True
        return {
            "id": uuid4(),
            "group_id": args[0],
            "group_player_id": args[1],
            "amount": args[2],
            "payment_type": "ATTENDANCE",
            "event_id": args[3],
            "notes": None,
            "created_by": args[4],
            "created_at": None,
        }


@pytest.mark.asyncio
async def test_event_attendance_charge_is_idempotent():
    event_id, group_id, player_id = uuid4(), uuid4(), uuid4()
    conn = _PaymentConnection(player_id)
    repo = PaymentsRepository(conn)

    first = await repo.charge_subs_for_event(event_id, group_id, 5)
    second = await repo.charge_subs_for_event(event_id, group_id, 5)

    assert len(first) == 1
    assert second == []
    assert all("ON CONFLICT DO NOTHING" in query for query in conn.insert_queries)
