"""Creates with a client-generated id are safe to retry: same owner gets the row back, anyone else gets 409."""
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.api.schemas.events import EventCreate
from app.api.schemas.groups import GroupCreate
from app.api.schemas.players import PlayerCreate
from app.application.services.event_service import EventService
from app.application.services.group_service import GroupService
from app.application.services.player_service import PlayerService
from app.exceptions import ConflictError
from app.infrastructure.repositories.events_repo import EventsRepository

OWNER = str(uuid4())


def _group_row(group_id, owner):
    return {"id": group_id, "owner_user_id": owner, "clerk_user_id": "clerk", "name": "League",
            "sport": "pickleball", "settings": {}, "created_at": datetime(2026, 1, 1)}


@pytest.mark.asyncio
@pytest.mark.parametrize("owner,ok", [(OWNER, True), (str(uuid4()), False)])
async def test_group_create_retry(owner, ok):
    group_id = uuid4()
    service = GroupService(MagicMock())
    service.groups_repo = SimpleNamespace(create=AsyncMock(return_value=_group_row(group_id, owner)))
    data = GroupCreate(id=group_id, name="League")

    if ok:
        assert (await service.create_group(OWNER, data)).id == group_id
    else:
        with pytest.raises(ConflictError):
            await service.create_group(OWNER, data)
    assert service.groups_repo.create.await_args.kwargs["group_id"] == group_id


def _event_service(existing_group):
    conn = MagicMock()
    tx = MagicMock()
    tx.__aenter__ = AsyncMock()
    tx.__aexit__ = AsyncMock(return_value=False)
    conn.transaction.return_value = tx
    service = EventService(conn)
    group_id = uuid4()
    service.groups_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": group_id, "owner_user_id": OWNER})
    )
    service.group_players_repo = SimpleNamespace(check_players_exist=AsyncMock(return_value=True))
    service.events_repo = SimpleNamespace(
        create=AsyncMock(return_value=None),  # id already taken
        get_by_id=AsyncMock(return_value={"group_id": existing_group or group_id}),
        add_participants=AsyncMock(),
    )
    service.get_event = AsyncMock(return_value="stored-event")
    return service, group_id, tx


@pytest.mark.asyncio
async def test_event_create_retry_returns_stored_event_without_reinserting_participants():
    service, group_id, tx = _event_service(existing_group=None)
    event_id = uuid4()
    data = EventCreate(id=event_id, courts=1, rounds=1, participantIds=[uuid4() for _ in range(4)])

    assert await service.create_event(OWNER, group_id, data) == "stored-event"
    service.get_event.assert_awaited_once_with(OWNER, event_id)
    service.events_repo.add_participants.assert_not_awaited()
    tx.__aenter__.assert_awaited_once()


@pytest.mark.asyncio
async def test_event_create_with_id_from_another_group_conflicts():
    service, group_id, _tx = _event_service(existing_group=uuid4())
    data = EventCreate(id=uuid4(), courts=1, rounds=1, participantIds=[uuid4() for _ in range(4)])
    with pytest.raises(ConflictError):
        await service.create_event(OWNER, group_id, data)


@pytest.mark.asyncio
@pytest.mark.parametrize("owner,ok", [(OWNER, True), (str(uuid4()), False)])
async def test_player_create_retry(owner, ok):
    player_id = uuid4()
    service = PlayerService(MagicMock())
    service.players_repo = SimpleNamespace(
        create=AsyncMock(return_value=None),
        get_by_id=AsyncMock(return_value={"id": player_id, "owner_user_id": owner, "display_name": "Al",
                                          "notes": None, "created_at": datetime(2026, 1, 1)}),
    )
    data = PlayerCreate(id=player_id, displayName="Al")
    if ok:
        assert (await service.create_player(OWNER, data)).id == player_id
    else:
        with pytest.raises(ConflictError):
            await service.create_player(OWNER, data)


@pytest.mark.asyncio
async def test_add_player_to_group_with_id_of_other_membership_conflicts():
    group_id, player_id = uuid4(), uuid4()
    service = PlayerService(MagicMock())
    service.groups_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": group_id, "owner_user_id": OWNER, "settings": {}})
    )
    service.players_repo = SimpleNamespace(
        get_by_id=AsyncMock(return_value={"id": player_id, "owner_user_id": OWNER})
    )
    service.group_players_repo = SimpleNamespace(
        add_player_to_group=AsyncMock(return_value={"id": uuid4(), "group_id": uuid4(), "player_id": player_id})
    )
    with pytest.raises(ConflictError):
        await service.add_player_to_group(OWNER, group_id, player_id, group_player_id=uuid4())


@pytest.mark.asyncio
async def test_event_repo_inserts_client_id_with_on_conflict_do_nothing():
    conn = MagicMock()
    conn.fetchrow = AsyncMock(return_value=None)
    event_id = uuid4()
    assert await EventsRepository(conn).create(uuid4(), "E", None, 1, 1, event_id=event_id) is None
    query, *args = conn.fetchrow.await_args.args
    assert "ON CONFLICT (id) DO NOTHING" in query
    assert args[-1] == event_id
