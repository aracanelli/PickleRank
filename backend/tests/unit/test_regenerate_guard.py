"""Regenerating a schedule must not silently wipe scores already entered."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.application.services.event_service import EventService
from app.exceptions import ConflictError


def _service(status, scored):
    conn = MagicMock()
    tx = MagicMock()
    tx.__aenter__ = AsyncMock()
    tx.__aexit__ = AsyncMock(return_value=False)
    conn.transaction.return_value = tx
    service = EventService(conn)
    event_id, group_id = uuid4(), uuid4()
    participants = [
        {"group_player_id": uuid4(), "rating": 1000 + i, "display_name": f"P{i}"} for i in range(4)
    ]
    service.events_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": event_id, "group_id": group_id, "status": status,
                                          "courts": 1, "rounds": 1}),
        get_participants=AsyncMock(return_value=participants),
        get_previous_event=AsyncMock(return_value=None),
        update_status=AsyncMock(),
    )
    service.groups_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": group_id, "owner_user_id": "owner", "settings": {}})
    )
    service.games_repo = SimpleNamespace(
        has_scored_games=AsyncMock(return_value=scored),
        delete_by_event=AsyncMock(),
        create_many=AsyncMock(),
        list_by_event_with_players=AsyncMock(return_value=[]),
    )
    return service, event_id


@pytest.mark.asyncio
async def test_regenerate_with_scores_is_rejected_without_force():
    service, event_id = _service("IN_PROGRESS", scored=True)
    with pytest.raises(ConflictError) as exc:
        await service.generate_schedule("owner", event_id)
    assert exc.value.status_code == 409
    service.games_repo.delete_by_event.assert_not_awaited()


@pytest.mark.asyncio
async def test_regenerate_with_force_replaces_games():
    service, event_id = _service("IN_PROGRESS", scored=True)
    await service.generate_schedule("owner", event_id, force=True)
    service.games_repo.delete_by_event.assert_awaited_once_with(event_id)
    service.games_repo.create_many.assert_awaited_once()


@pytest.mark.asyncio
async def test_first_generation_skips_score_check_and_fetches_group_once():
    service, event_id = _service("DRAFT", scored=False)
    await service.generate_schedule("owner", event_id)
    service.games_repo.has_scored_games.assert_not_awaited()
    service.groups_repo.get_by_id.assert_awaited_once()
    service.games_repo.create_many.assert_awaited_once()


@pytest.mark.asyncio
async def test_regenerate_unscored_event_still_works():
    service, event_id = _service("GENERATED", scored=False)
    await service.generate_schedule("owner", event_id)
    service.games_repo.create_many.assert_awaited_once()
