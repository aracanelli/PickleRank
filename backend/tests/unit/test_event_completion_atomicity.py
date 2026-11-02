from types import SimpleNamespace
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.api.schemas.events import EventStatus
from app.application.services.event_service import EventService
from app.exceptions import BadRequestError


class _Transaction:
    def __init__(self):
        self.rollback_error = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, _tb):
        self.rollback_error = exc
        return False


class _Connection:
    def __init__(self):
        self.transactions = []

    def transaction(self):
        transaction = _Transaction()
        self.transactions.append(transaction)
        return transaction


class _PaymentService:
    calls = []
    error = None

    def __init__(self, _conn):
        pass

    async def charge_subs_for_event(self, event_id, group_id, user_id):
        self.calls.append((event_id, group_id, user_id))
        if self.error:
            raise self.error
        return []


def _game(event_id, result="TEAM1_WIN"):
    players = [uuid4() for _ in range(4)]
    return {
        "event_id": event_id,
        "round_index": 0,
        "result": result,
        "score_team1": 11,
        "score_team2": 7,
        "team1_p1": players[0],
        "team1_p2": players[1],
        "team2_p1": players[2],
        "team2_p2": players[3],
        "t1p1_rating": 1000,
        "t1p2_rating": 1000,
        "t2p1_rating": 1000,
        "t2p2_rating": 1000,
        "t1p1_name": "A",
        "t1p2_name": "B",
        "t2p1_name": "C",
        "t2p2_name": "D",
    }, players


def _service(event_id, status="IN_PROGRESS"):
    conn = _Connection()
    service = EventService(conn)
    group_id = uuid4()
    event = {"id": event_id, "group_id": group_id, "status": status}
    group = {"id": group_id, "owner_user_id": "organizer", "settings": {}}
    game, player_ids = _game(event_id)
    participants = [
        {"group_player_id": player_id, "rating": 1000, "display_name": name}
        for player_id, name in zip(player_ids, ("A", "B", "C", "D"))
    ]

    service.events_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value=event),
        get_by_id_for_update=AsyncMock(side_effect=[event, {**event, "status": "COMPLETED"}]),
        get_participants=AsyncMock(return_value=participants),
        update_status=AsyncMock(),
    )
    service.groups_repo = SimpleNamespace(get_by_id=AsyncMock(return_value=group))
    service.group_players_repo = SimpleNamespace(is_organizer=AsyncMock(return_value=False))
    service.games_repo = SimpleNamespace(list_by_event_with_players=AsyncMock(return_value=[game]))
    service.rating_updates_repo = SimpleNamespace(
        create_many=AsyncMock(),
        list_by_event=AsyncMock(return_value=[]),
    )
    service.group_players_repo.update_ratings_bulk = AsyncMock()
    return service, conn, event, group_id


@pytest.mark.asyncio
async def test_complete_event_retry_returns_stored_ratings_without_reapplying_side_effects(monkeypatch):
    event_id = uuid4()
    service, _conn, event, group_id = _service(event_id)
    stored_update = {
        "group_player_id": uuid4(),
        "display_name": "A",
        "rating_before": 1000,
        "rating_after": 1050,
        "delta": 50,
    }
    service.rating_updates_repo.list_by_event = AsyncMock(return_value=[stored_update])
    _PaymentService.calls = []
    _PaymentService.error = None
    monkeypatch.setattr("app.application.services.payment_service.PaymentService", _PaymentService)

    first = await service.complete_event("organizer", event_id)
    second = await service.complete_event("organizer", event_id)

    assert first.status == EventStatus.COMPLETED
    assert second.rating_updates[0].rating_after == 1050
    assert service.group_players_repo.update_ratings_bulk.await_count == 1
    assert service.rating_updates_repo.create_many.await_count == 1
    assert service.events_repo.update_status.await_count == 1
    assert _PaymentService.calls == [(event_id, group_id, "organizer"), (event_id, group_id, "organizer")]


@pytest.mark.asyncio
async def test_complete_event_payment_failure_rolls_back_completion_transaction(monkeypatch):
    event_id = uuid4()
    service, conn, _event, _group_id = _service(event_id)
    _PaymentService.calls = []
    _PaymentService.error = RuntimeError("payment unavailable")
    monkeypatch.setattr("app.application.services.payment_service.PaymentService", _PaymentService)

    with pytest.raises(RuntimeError, match="payment unavailable"):
        await service.complete_event("organizer", event_id)

    assert conn.transactions[0].rollback_error is not None
    assert service.group_players_repo.update_ratings_bulk.await_count == 1
    assert service.events_repo.update_status.await_count == 1


@pytest.mark.asyncio
async def test_complete_event_rejects_invalid_tie_before_writes():
    event_id = uuid4()
    service, _conn, _event, _group_id = _service(event_id)
    invalid_game, _ = _game(event_id, result="TIE")
    invalid_game["score_team2"] = 7
    service.games_repo.list_by_event_with_players = AsyncMock(return_value=[invalid_game])

    with pytest.raises(BadRequestError, match="equal, completed scores"):
        await service.complete_event("organizer", event_id)

    service.group_players_repo.update_ratings_bulk.assert_not_awaited()
    service.rating_updates_repo.create_many.assert_not_awaited()
    service.events_repo.update_status.assert_not_awaited()
