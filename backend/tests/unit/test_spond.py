"""Unit tests for the Spond integration (crypto + attendee resolution)."""

from unittest.mock import AsyncMock
from uuid import uuid4

from cryptography.fernet import Fernet

from app.application.services.spond_service import SpondService, _normalize_name

# ----- crypto round-trip -----


def test_fernet_round_trip(monkeypatch):
    monkeypatch.setenv("SPOND_ENCRYPTION_KEY", Fernet.generate_key().decode())
    # Rebuild cached settings so the new key is picked up.
    from app.config import get_settings

    get_settings.cache_clear()
    from app.infrastructure.spond import crypto

    ciphertext = crypto.encrypt_secret("s3cret-pw")
    assert ciphertext != "s3cret-pw"
    assert crypto.decrypt_secret(ciphertext) == "s3cret-pw"
    get_settings.cache_clear()


def test_normalize_name():
    assert _normalize_name("  John   Doe ") == "john doe"
    assert _normalize_name("ALICE") == "alice"


# ----- resolve_event -----


def _make_service():
    """Build a SpondService with all repos/client mocked."""
    service = SpondService(conn=object(), client=AsyncMock())
    service.spond_repo = AsyncMock()
    service.groups_repo = AsyncMock()
    service.group_players_repo = AsyncMock()
    service.players_repo = AsyncMock()
    return service


async def test_resolve_event_matches_links_suggestions_and_unmatched():
    service = _make_service()
    user_id = str(uuid4())

    gp1, p1 = uuid4(), uuid4()  # Alice: saved link
    gp2, p2 = uuid4(), uuid4()  # Bob: name suggestion only

    # Owner short-circuits the authorization check.
    service.groups_repo.get_by_id.return_value = {"id": uuid4(), "owner_user_id": user_id}
    service.spond_repo.get_group_link.return_value = {"spond_group_id": "sg1"}
    service.group_players_repo.list_by_group.return_value = [
        {"id": gp1, "player_id": p1, "display_name": "Alice Smith"},
        {"id": gp2, "player_id": p2, "display_name": "Bob Jones"},
    ]
    service.spond_repo.get_member_links.return_value = [
        {"spond_member_id": "m1", "player_id": p1},
    ]
    # Avoid a real token/login flow; return the attendees directly.
    service._token_with_retry = AsyncMock(
        return_value=[
            {"spond_member_id": "m1", "name": "Alice Smith", "email": None},
            {"spond_member_id": "m2", "name": "Bob Jones", "email": None},
            {"spond_member_id": "m3", "name": "Charlie New", "email": None},
        ]
    )
    service._require_account = AsyncMock(return_value={"spond_email": "x@y.z"})

    result = await service.resolve_event(user_id, uuid4(), "e1")

    by_member = {a.spond_member_id: a for a in result.attendees}
    assert by_member["m1"].matched_group_player_id == gp1
    assert by_member["m1"].suggested_group_player_id is None
    assert by_member["m2"].matched_group_player_id is None
    assert by_member["m2"].suggested_group_player_id == gp2
    assert by_member["m3"].matched_group_player_id is None
    assert by_member["m3"].suggested_group_player_id is None
    assert result.matched_group_player_ids == [gp1]


async def test_confirm_links_existing_and_create_new():
    from app.api.schemas.spond import SpondAttendeeLinkInput

    service = _make_service()
    user_id = str(uuid4())

    gp1, p1 = uuid4(), uuid4()  # existing roster player
    new_player_id, new_gp_id = uuid4(), uuid4()

    # user is the group owner -> authorized.
    service.groups_repo.get_by_id.return_value = {
        "id": uuid4(),
        "owner_user_id": user_id,
        "settings": {"initialRating": 1000},
    }
    service.group_players_repo.list_by_group.return_value = [
        {"id": gp1, "player_id": p1, "display_name": "Alice"},
    ]
    service.players_repo.create.return_value = {"id": new_player_id, "display_name": "Zoe New"}
    service.group_players_repo.add_player_to_group.return_value = {"id": new_gp_id}
    service.spond_repo.upsert_member_link.return_value = {}

    links = [
        SpondAttendeeLinkInput(spondMemberId="m1", groupPlayerId=gp1),
        SpondAttendeeLinkInput(spondMemberId="m2", createName="Zoe New"),
    ]
    result = await service.confirm_links(user_id, uuid4(), links)

    assert result.group_player_ids == [gp1, new_gp_id]
    service.players_repo.create.assert_awaited_once()
    service.group_players_repo.add_player_to_group.assert_awaited_once()
    assert service.spond_repo.upsert_member_link.await_count == 2
