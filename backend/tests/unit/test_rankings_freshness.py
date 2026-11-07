"""Rankings must reflect a completed event right away, and a score of 0 must survive in history."""
from datetime import datetime
from uuid import uuid4

import pytest

from app.application.services.ranking_service import RankingService
from app.infrastructure.cache import invalidate_rankings, rankings_cache


@pytest.mark.asyncio
async def test_invalidate_rankings_drops_only_that_group():
    a, b = uuid4(), uuid4()
    await rankings_cache.set(f"rankings:{a}", "A")
    await rankings_cache.set(f"rankings:{b}", "B")
    await invalidate_rankings(a)
    assert await rankings_cache.get(f"rankings:{a}") is None
    assert await rankings_cache.get(f"rankings:{b}") == "B"


class _FakeConn:
    """Answers the three queries get_match_history makes: group lookup, count, rows."""

    def __init__(self, owner: str, rows):
        self.owner = owner
        self.rows = rows

    async def fetchrow(self, query, *args):
        if "COUNT(*)" in query:
            return {"total": len(self.rows)}
        return {"id": args[0], "owner_user_id": self.owner, "name": "League", "settings": {}}

    async def fetch(self, query, *args):
        return self.rows


@pytest.mark.asyncio
async def test_history_keeps_zero_scores():
    row = {
        "game_id": uuid4(), "event_id": uuid4(), "event_name": "Week 1", "event_date": datetime(2026, 1, 1),
        "round_index": 0, "court_index": 0, "score_team1": 11, "score_team2": 0, "result": "TEAM1_WIN",
        "team1_p1": uuid4(), "team1_p2": uuid4(), "team2_p1": uuid4(), "team2_p2": uuid4(),
        "t1p1_name": "A", "t1p2_name": "B", "t2p1_name": "C", "t2p2_name": "D",
        "team1_elo": 1000, "team2_elo": 1000,
    }
    service = RankingService(_FakeConn(owner="owner", rows=[row]))

    async def get_by_id(group_id):
        return {"id": group_id, "owner_user_id": "owner"}

    service.groups_repo.get_by_id = get_by_id
    matches, total = await service.get_match_history("owner", uuid4())
    assert total == 1
    dumped = matches[0].model_dump(by_alias=True)
    assert dumped["scoreTeam1"] == 11.0
    assert dumped["scoreTeam2"] == 0.0
