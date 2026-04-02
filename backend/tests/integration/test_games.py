"""
Integration tests for game endpoints.

Covers:
  PATCH  /api/games/{game_id}/score
  DELETE /api/games/{game_id}
  PATCH  /api/games/{game_id}/players
"""

from unittest.mock import patch
from uuid import uuid4

from app.api.schemas.events import GameResponse, GameResult, PlayerInfo
from app.exceptions import NotFoundError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_game_response(
    game_id=None,
    score_team1=None,
    score_team2=None,
    result=GameResult.UNSET,
) -> GameResponse:
    return GameResponse(
        id=game_id or uuid4(),
        roundIndex=0,
        courtIndex=0,
        team1=[
            PlayerInfo(id=uuid4(), displayName="Alice"),
            PlayerInfo(id=uuid4(), displayName="Bob"),
        ],
        team2=[
            PlayerInfo(id=uuid4(), displayName="Charlie"),
            PlayerInfo(id=uuid4(), displayName="Diana"),
        ],
        scoreTeam1=score_team1,
        scoreTeam2=score_team2,
        team1Elo=None,
        team2Elo=None,
        result=result,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestUpdateScore:
    """PATCH /api/games/{game_id}/score"""

    @patch("app.application.services.event_service.EventService.update_score")
    def test_update_score_success(self, mock_update, client):
        """Updating a game score returns 200."""
        game_id = uuid4()
        mock_update.return_value = _make_game_response(
            game_id=game_id,
            score_team1=11.0,
            score_team2=9.0,
            result=GameResult.TEAM1_WIN,
        )

        response = client.patch(
            f"/api/games/{game_id}/score",
            json={"scoreTeam1": 11, "scoreTeam2": 9},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["scoreTeam1"] == 11.0
        assert data["scoreTeam2"] == 9.0
        assert data["result"] == "TEAM1_WIN"

    @patch("app.application.services.event_service.EventService.update_score")
    def test_update_score_not_found(self, mock_update, client):
        """Updating score for a non-existent game returns 404."""
        game_id = uuid4()
        mock_update.side_effect = NotFoundError("Game", str(game_id))

        response = client.patch(
            f"/api/games/{game_id}/score",
            json={"scoreTeam1": 11, "scoreTeam2": 9},
        )

        assert response.status_code == 404

    @patch("app.application.services.event_service.EventService.update_score")
    def test_update_score_with_tie(self, mock_update, client):
        """Updating scores to equal values results in TIE."""
        game_id = uuid4()
        mock_update.return_value = _make_game_response(
            game_id=game_id,
            score_team1=10.0,
            score_team2=10.0,
            result=GameResult.TIE,
        )

        response = client.patch(
            f"/api/games/{game_id}/score",
            json={"scoreTeam1": 10, "scoreTeam2": 10},
        )

        assert response.status_code == 200
        assert response.json()["result"] == "TIE"

    @patch("app.application.services.event_service.EventService.update_score")
    def test_update_score_clear(self, mock_update, client):
        """Setting scores to null clears the result."""
        game_id = uuid4()
        mock_update.return_value = _make_game_response(
            game_id=game_id,
            score_team1=None,
            score_team2=None,
            result=GameResult.UNSET,
        )

        response = client.patch(
            f"/api/games/{game_id}/score",
            json={"scoreTeam1": None, "scoreTeam2": None},
        )

        assert response.status_code == 200
        assert response.json()["result"] == "UNSET"


class TestDeleteGame:
    """DELETE /api/games/{game_id}"""

    @patch("app.application.services.event_service.EventService.delete_game")
    def test_delete_game_success(self, mock_delete, client):
        """Deleting a game returns 200."""
        game_id = uuid4()
        mock_delete.return_value = None

        response = client.delete(f"/api/games/{game_id}")

        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

    @patch("app.application.services.event_service.EventService.delete_game")
    def test_delete_game_not_found(self, mock_delete, client):
        """Deleting a non-existent game returns 404."""
        game_id = uuid4()
        mock_delete.side_effect = NotFoundError("Game", str(game_id))

        response = client.delete(f"/api/games/{game_id}")

        assert response.status_code == 404


class TestGameAuthRequired:
    """Verify game endpoints require authentication."""

    def test_update_score_no_auth(self):
        """PATCH /api/games/{id}/score without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.patch(
                f"/api/games/{uuid4()}/score",
                json={"scoreTeam1": 11, "scoreTeam2": 9},
            )

        assert response.status_code == 401

    def test_delete_game_no_auth(self):
        """DELETE /api/games/{id} without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.delete(f"/api/games/{uuid4()}")

        assert response.status_code == 401
