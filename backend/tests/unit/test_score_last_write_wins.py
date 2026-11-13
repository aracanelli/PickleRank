"""PATCH /games/{id}/score: last write wins by edit time, so stale offline replays never clobber newer scores."""
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.application.services.event_service import EventService
from app.exceptions import ForbiddenError
from app.infrastructure.repositories.games_repo import GamesRepository

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def _stored_game(game_id, edited_at):
    ids = [uuid4() for _ in range(4)]
    return {
        "id": game_id, "round_index": 0, "court_index": 0,
        "team1_p1": ids[0], "team1_p2": ids[1], "team2_p1": ids[2], "team2_p2": ids[3],
        "t1p1_name": "A", "t1p2_name": "B", "t2p1_name": "C", "t2p2_name": "D",
        "t1p1_rating": 1000, "t1p2_rating": 1000, "t2p1_rating": 1000, "t2p2_rating": 1000,
        "score_team1": 11, "score_team2": 3, "team1_elo": 1000, "team2_elo": 1000,
        "result": "TEAM1_WIN", "score_edited_at": edited_at,
    }


def _service(status="IN_PROGRESS", updated=True, owner="owner", stored_edit=None):
    conn = MagicMock()
    service = EventService(conn)
    game_id, event_id, group_id = uuid4(), uuid4(), uuid4()
    stored_edit = stored_edit or datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
    service.games_repo = SimpleNamespace(
        get_score_context=AsyncMock(return_value={
            "id": game_id, "event_id": event_id, "event_status": status,
            "group_id": group_id, "owner_user_id": owner,
        }),
        update_score=AsyncMock(return_value={"id": game_id} if updated else None),
        list_by_event_with_players=AsyncMock(return_value=[_stored_game(game_id, stored_edit)]),
    )
    service.events_repo = SimpleNamespace(update_status=AsyncMock())
    service.group_players_repo = SimpleNamespace(is_organizer=AsyncMock(return_value=False))
    return service, conn, game_id, event_id, group_id


@pytest.mark.asyncio
async def test_fresh_write_updates_and_returns_one_game_with_edited_at():
    service, _conn, game_id, event_id, _ = _service(status="GENERATED")
    edited_ms = 1_763_000_000_000  # in the past relative to now

    game = await service.update_score("owner", game_id, 11, 3, edited_ms)

    args = service.games_repo.update_score.await_args.args
    assert args[:3] == (game_id, 11, 3)
    assert args[3] == EPOCH + timedelta(milliseconds=edited_ms)
    service.events_repo.update_status.assert_awaited_once_with(event_id, "IN_PROGRESS")
    # owner path: context + update + single-game fetch, no role lookup, no whole-event list
    service.group_players_repo.is_organizer.assert_not_awaited()
    service.games_repo.list_by_event_with_players.assert_awaited_once_with(event_id, game_id)
    expected_ms = (datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc) - EPOCH) // timedelta(milliseconds=1)
    assert game.model_dump(by_alias=True)["editedAt"] == expected_ms


@pytest.mark.asyncio
async def test_stale_replay_returns_stored_game_without_side_effects(monkeypatch):
    service, _conn, game_id, _event_id, _ = _service(status="COMPLETED", updated=False)
    recalc = AsyncMock()
    monkeypatch.setattr(
        "app.application.services.group_service.GroupService.recalculate_ratings", recalc
    )

    game = await service.update_score("owner", game_id, 0, 11, 1_000)

    assert game.score_team1 == 11.0 and game.score_team2 == 3.0  # the newer stored value
    recalc.assert_not_awaited()
    service.events_repo.update_status.assert_not_awaited()


@pytest.mark.asyncio
async def test_completed_event_recalculates_inside_a_transaction(monkeypatch):
    service, conn, game_id, _event_id, group_id = _service(status="COMPLETED")
    recalc = AsyncMock()
    monkeypatch.setattr(
        "app.application.services.group_service.GroupService.recalculate_ratings", recalc
    )
    tx = MagicMock()
    tx.__aenter__ = AsyncMock()
    tx.__aexit__ = AsyncMock(return_value=False)
    conn.transaction.return_value = tx

    await service.update_score("owner", game_id, 11, 3)

    recalc.assert_awaited_once_with("owner", group_id)
    tx.__aenter__.assert_awaited_once()


@pytest.mark.asyncio
async def test_future_device_clock_is_clamped_and_missing_edited_at_uses_now():
    service, _conn, game_id, _event_id, _ = _service()
    before = datetime.now(timezone.utc)

    await service.update_score("owner", game_id, 11, 3, 99_999_999_999_999)
    clamped = service.games_repo.update_score.await_args.args[3]
    await service.update_score("owner", game_id, 11, 3)
    defaulted = service.games_repo.update_score.await_args.args[3]

    after = datetime.now(timezone.utc)
    assert before <= clamped <= after
    assert before <= defaulted <= after


@pytest.mark.asyncio
async def test_non_owner_needs_organizer_role():
    service, _conn, game_id, _event_id, group_id = _service(owner="someone-else")
    with pytest.raises(ForbiddenError):
        await service.update_score("user", game_id, 11, 3)
    service.group_players_repo.is_organizer.assert_awaited_once_with("user", group_id)
    service.games_repo.update_score.assert_not_awaited()


@pytest.mark.asyncio
async def test_repo_update_is_conditional_on_edit_time():
    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    edited = datetime(2026, 1, 1, tzinfo=timezone.utc)

    assert await GamesRepository(conn).update_score(uuid4(), 11, 3, edited) is None

    query, *args = conn.fetchrow.await_args.args
    assert "score_edited_at IS NULL OR score_edited_at <= $5" in query
    assert args[-2] == edited
    assert args[-1] is None  # no base version
