"""
Integration tests for group endpoints.

Covers:
  POST   /api/groups
  GET    /api/groups
  GET    /api/groups/{id}
  PATCH  /api/groups/{id}
  PATCH  /api/groups/{id}/settings
  POST   /api/groups/{id}/archive
"""

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from app.api.schemas.groups import GroupListItem, GroupResponse, GroupSettings
from tests.integration.conftest import TEST_USER_ID

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_DEFAULT_SETTINGS = GroupSettings()


def _make_group_response(
    group_id=None,
    name="Friday Night Pickles",
    sport="pickleball",
    owner_user_id=TEST_USER_ID,
    settings=None,
    is_archived=False,
) -> GroupResponse:
    """Return a GroupResponse object for mocking service returns."""
    return GroupResponse(
        id=group_id or uuid4(),
        ownerUserId=owner_user_id,
        name=name,
        sport=sport,
        settings=settings or _DEFAULT_SETTINGS,
        created_at=datetime.now(timezone.utc),
        updated_at=None,
        isArchived=is_archived,
    )


def _make_group_list_item(
    group_id=None,
    name="Friday Night Pickles",
    sport="pickleball",
    player_count=8,
    is_archived=False,
) -> GroupListItem:
    return GroupListItem(
        id=group_id or uuid4(),
        name=name,
        sport=sport,
        playerCount=player_count,
        created_at=datetime.now(timezone.utc),
        isArchived=is_archived,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCreateGroup:
    """POST /api/groups"""

    @patch("app.application.services.group_service.GroupService.create_group")
    def test_create_group_success(self, mock_create, client):
        """Creating a group returns 201."""
        mock_create.return_value = _make_group_response(name="Weekend Warriors")

        response = client.post(
            "/api/groups",
            json={"name": "Weekend Warriors"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["name"] == "Weekend Warriors"
        assert data["sport"] == "pickleball"

    @patch("app.application.services.group_service.GroupService.create_group")
    def test_create_group_with_settings(self, mock_create, client):
        """Creating a group with custom settings succeeds."""
        custom_settings = GroupSettings(kFactor=64, initialRating=1200)
        mock_create.return_value = _make_group_response(name="Pro League", settings=custom_settings)

        response = client.post(
            "/api/groups",
            json={
                "name": "Pro League",
                "settings": {"kFactor": 64, "initialRating": 1200},
            },
        )

        assert response.status_code == 201

    def test_create_group_missing_name(self, client):
        """Omitting name should return 422."""
        response = client.post("/api/groups", json={})
        assert response.status_code == 422

    def test_create_group_empty_name(self, client):
        """Empty name should return 422."""
        response = client.post("/api/groups", json={"name": ""})
        assert response.status_code == 422


class TestListGroups:
    """GET /api/groups"""

    @patch("app.application.services.group_service.GroupService.list_groups")
    def test_list_groups_empty(self, mock_list, client):
        """No groups returns empty list."""
        mock_list.return_value = []

        response = client.get("/api/groups")

        assert response.status_code == 200
        assert response.json()["groups"] == []

    @patch("app.application.services.group_service.GroupService.list_groups")
    def test_list_groups_returns_data(self, mock_list, client):
        """Listing groups returns available groups."""
        mock_list.return_value = [
            _make_group_list_item(name="Group A"),
            _make_group_list_item(name="Group B"),
        ]

        response = client.get("/api/groups")

        assert response.status_code == 200
        data = response.json()
        assert len(data["groups"]) == 2


class TestGetGroup:
    """GET /api/groups/{group_id}"""

    @patch("app.application.services.group_service.GroupService.get_group")
    def test_get_group_success(self, mock_get, client):
        """Getting an existing group returns 200."""
        gid = uuid4()
        mock_get.return_value = _make_group_response(group_id=gid, name="My Group")

        response = client.get(f"/api/groups/{gid}")

        assert response.status_code == 200
        assert response.json()["name"] == "My Group"

    @patch("app.application.services.group_service.GroupService.get_group")
    def test_get_group_not_found(self, mock_get, client):
        """Getting a non-existent group returns 404."""
        from app.exceptions import NotFoundError

        mock_get.side_effect = NotFoundError("Group", str(uuid4()))

        response = client.get(f"/api/groups/{uuid4()}")

        assert response.status_code == 404


class TestUpdateGroup:
    """PATCH /api/groups/{group_id}"""

    @patch("app.application.services.group_service.GroupService.update_group")
    def test_update_group_name(self, mock_update, client):
        """Updating a group name succeeds."""
        gid = uuid4()
        mock_update.return_value = _make_group_response(group_id=gid, name="New Name")

        response = client.patch(
            f"/api/groups/{gid}",
            json={"name": "New Name"},
        )

        assert response.status_code == 200
        assert response.json()["name"] == "New Name"


class TestUpdateGroupSettings:
    """PATCH /api/groups/{group_id}/settings"""

    @patch("app.application.services.group_service.GroupService.update_settings")
    def test_update_settings_k_factor(self, mock_update, client):
        """Updating k_factor via settings endpoint succeeds."""
        gid = uuid4()
        new_settings = GroupSettings(kFactor=48)
        mock_update.return_value = _make_group_response(group_id=gid, settings=new_settings)

        response = client.patch(
            f"/api/groups/{gid}/settings",
            json={"kFactor": 48},
        )

        assert response.status_code == 200


class TestArchiveGroup:
    """POST /api/groups/{group_id}/archive"""

    @patch("app.application.services.group_service.GroupService.archive_group")
    def test_archive_group_success(self, mock_archive, client):
        """Archiving a group returns 200."""
        gid = uuid4()
        mock_archive.return_value = _make_group_response(group_id=gid, is_archived=True)

        response = client.post(f"/api/groups/{gid}/archive")

        assert response.status_code == 200


class TestGroupAuthRequired:
    """Verify group endpoints require auth."""

    def test_list_groups_no_auth(self):
        """GET /api/groups without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.get("/api/groups")

        assert response.status_code == 401

    def test_create_group_no_auth(self):
        """POST /api/groups without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.post("/api/groups", json={"name": "No Auth"})

        assert response.status_code == 401
