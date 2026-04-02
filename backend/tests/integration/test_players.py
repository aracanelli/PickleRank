"""
Integration tests for player endpoints.

Covers:
  POST   /api/players
  GET    /api/players
  GET    /api/players/{id}
  PATCH  /api/players/{id}
  POST   /api/players/bulk
"""

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from app.api.schemas.players import (
    BulkPlayerCreateResponseWithToken,
    PlayerResponseWithToken,
)
from app.exceptions import NotFoundError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_player_response(
    player_id=None,
    display_name="Alice",
    notes=None,
    invite_token="tok_abc",
) -> PlayerResponseWithToken:
    return PlayerResponseWithToken(
        id=player_id or uuid4(),
        displayName=display_name,
        notes=notes,
        userId=None,
        created_at=datetime.now(timezone.utc),
        inviteToken=invite_token,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCreatePlayer:
    """POST /api/players"""

    @patch("app.application.services.player_service.PlayerService.create_player")
    def test_create_player_success(self, mock_create, client):
        """Creating a player returns 201 with the player data."""
        mock_create.return_value = _make_player_response(display_name="Alice")

        response = client.post(
            "/api/players",
            json={"displayName": "Alice"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["displayName"] == "Alice"
        assert "id" in data

    @patch("app.application.services.player_service.PlayerService.create_player")
    def test_create_player_with_notes(self, mock_create, client):
        """Creating a player with notes succeeds."""
        mock_create.return_value = _make_player_response(display_name="Bob", notes="Lefty")

        response = client.post(
            "/api/players",
            json={"displayName": "Bob", "notes": "Lefty"},
        )

        assert response.status_code == 201
        assert response.json()["notes"] == "Lefty"

    def test_create_player_missing_name_returns_422(self, client):
        """Omitting displayName should return 422 validation error."""
        response = client.post("/api/players", json={})
        assert response.status_code == 422

    def test_create_player_empty_name_returns_422(self, client):
        """Empty string display name should be rejected."""
        response = client.post("/api/players", json={"displayName": ""})
        assert response.status_code == 422


class TestListPlayers:
    """GET /api/players"""

    @patch("app.application.services.player_service.PlayerService.list_players")
    def test_list_players_empty(self, mock_list, client):
        """Listing players when none exist returns empty list."""
        mock_list.return_value = []

        response = client.get("/api/players")

        assert response.status_code == 200
        assert response.json()["players"] == []

    @patch("app.application.services.player_service.PlayerService.list_players")
    def test_list_players_returns_data(self, mock_list, client):
        """Listing players returns existing players."""
        mock_list.return_value = [
            _make_player_response(display_name="Alice"),
            _make_player_response(display_name="Bob"),
        ]

        response = client.get("/api/players")

        assert response.status_code == 200
        data = response.json()
        assert len(data["players"]) == 2
        names = {p["displayName"] for p in data["players"]}
        assert names == {"Alice", "Bob"}


class TestGetPlayer:
    """GET /api/players/{player_id}"""

    @patch("app.application.services.player_service.PlayerService.get_player")
    def test_get_player_success(self, mock_get, client):
        """Getting an existing player returns 200."""
        pid = uuid4()
        mock_get.return_value = _make_player_response(player_id=pid, display_name="Charlie")

        response = client.get(f"/api/players/{pid}")

        assert response.status_code == 200
        assert response.json()["displayName"] == "Charlie"

    @patch("app.application.services.player_service.PlayerService.get_player")
    def test_get_player_not_found(self, mock_get, client):
        """Getting a non-existent player returns 404."""
        pid = uuid4()
        mock_get.side_effect = NotFoundError("Player", str(pid))

        response = client.get(f"/api/players/{pid}")

        assert response.status_code == 404


class TestUpdatePlayer:
    """PATCH /api/players/{player_id}"""

    @patch("app.application.services.player_service.PlayerService.update_player")
    def test_update_player_name(self, mock_update, client):
        """Updating a player's display name succeeds."""
        pid = uuid4()
        mock_update.return_value = _make_player_response(
            player_id=pid, display_name="Alice Updated"
        )

        response = client.patch(
            f"/api/players/{pid}",
            json={"displayName": "Alice Updated"},
        )

        assert response.status_code == 200
        assert response.json()["displayName"] == "Alice Updated"

    @patch("app.application.services.player_service.PlayerService.update_player")
    def test_update_nonexistent_player(self, mock_update, client):
        """Updating a player that doesn't exist returns 404."""
        pid = uuid4()
        mock_update.side_effect = NotFoundError("Player", str(pid))

        response = client.patch(
            f"/api/players/{pid}",
            json={"displayName": "Nobody"},
        )

        assert response.status_code == 404


class TestBulkCreatePlayers:
    """POST /api/players/bulk"""

    @patch("app.application.services.player_service.PlayerService.bulk_create_players")
    def test_bulk_create_success(self, mock_bulk, client):
        """Bulk creating players returns 201."""
        mock_bulk.return_value = BulkPlayerCreateResponseWithToken(
            created=[
                _make_player_response(display_name="Alice"),
                _make_player_response(display_name="Bob"),
            ],
            skipped=[],
            errors=[],
        )

        response = client.post(
            "/api/players/bulk",
            json={"names": ["Alice", "Bob"]},
        )

        assert response.status_code == 201
        data = response.json()
        assert len(data["created"]) == 2

    def test_bulk_create_empty_list_returns_422(self, client):
        """Bulk create with empty names list should fail validation."""
        response = client.post("/api/players/bulk", json={"names": []})
        assert response.status_code == 422


class TestPlayerAuthRequired:
    """Verify that player endpoints require authentication."""

    def test_create_player_no_auth(self):
        """POST /api/players without auth should return 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.post("/api/players", json={"displayName": "Test"})

        assert response.status_code == 401
