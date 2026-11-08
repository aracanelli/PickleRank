"""Awards publish step: organizer-only publish/unpublish, members see stat awards/results only once published."""
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.application.services.award_service import AwardService
from app.exceptions import ForbiddenError

OWNER = str(uuid4())
ORGANIZER = str(uuid4())
MEMBER = str(uuid4())
STATS = [{"key": "mvp", "title": "MVP"}]


def _service(status="DRAFT", published_at=None, categories=()):
    gid, eid = uuid4(), uuid4()
    edition = {
        "id": eid, "group_id": gid, "title": "Awards", "status": status,
        "stat_awards": STATS, "published_at": published_at, "created_at": datetime.now(timezone.utc),
    }
    s = AwardService(conn=None)
    calls = []

    async def get_by_id(_):
        return {"id": gid, "owner_user_id": OWNER}

    async def is_organizer(user_id, _):
        return user_id == ORGANIZER

    async def is_member(user_id, _):
        return user_id in (ORGANIZER, MEMBER)

    async def edition_lookup(*_):
        return edition

    async def set_published(_, published):
        calls.append(published)
        edition["published_at"] = datetime.now(timezone.utc) if published else None
        return edition

    async def list_categories(_):
        return list(categories)

    async def none(*_):
        return None

    async def empty(*_):
        return {}

    s.groups_repo.get_by_id = get_by_id
    s.group_players_repo.is_organizer = is_organizer
    s.group_players_repo.is_member = is_member
    s.awards_repo.get_latest_edition = edition_lookup
    s.awards_repo.get_edition = edition_lookup
    s.awards_repo.set_published = set_published
    s.awards_repo.list_categories = list_categories
    s.awards_repo.resolve_group_player_id = none
    s.awards_repo.get_my_votes = empty
    s.awards_repo.get_results = empty
    return s, gid, eid, calls


async def test_member_cannot_publish_or_unpublish():
    s, gid, eid, calls = _service()
    with pytest.raises(ForbiddenError):
        await s.set_published(MEMBER, gid, eid, True)
    with pytest.raises(ForbiddenError):
        await s.set_published(MEMBER, gid, eid, False)
    assert calls == []


async def test_publish_draft_with_zero_categories_then_unpublish():
    s, gid, eid, calls = _service(status="DRAFT")
    dto = await s.set_published(ORGANIZER, gid, eid, True)
    assert dto.published_at is not None and dto.categories == []
    dto = await s.set_published(OWNER, gid, eid, False)
    assert dto.published_at is None
    assert calls == [True, False]


@pytest.mark.parametrize("status", ["DRAFT", "CLOSED"])
async def test_member_sees_nothing_until_published(status):
    s, gid, *_ = _service(status=status)
    assert await s.get_awards(MEMBER, gid) is None
    # organizers always see everything
    assert (await s.get_awards(ORGANIZER, gid)).stat_awards == STATS


async def test_member_can_vote_on_unpublished_open_voting_but_not_see_stats():
    s, gid, *_ = _service(status="VOTING_OPEN", categories=[{"id": uuid4(), "title": "MVP", "description": None}])
    dto = await s.get_awards(MEMBER, gid)
    assert dto.status.value == "VOTING_OPEN" and len(dto.categories) == 1
    assert dto.stat_awards == [] and dto.published_at is None


@pytest.mark.parametrize("status", ["DRAFT", "VOTING_OPEN", "CLOSED"])
async def test_member_sees_stats_once_published(status):
    s, gid, *_ = _service(status=status, published_at=datetime.now(timezone.utc))
    dto = await s.get_awards(MEMBER, gid)
    assert dto.stat_awards == STATS and dto.published_at is not None
