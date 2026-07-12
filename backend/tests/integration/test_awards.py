"""
Integration tests for the Awards endpoints.

Covers:
  GET    /api/groups/{group_id}/awards
  POST   /api/groups/{group_id}/awards
  PATCH  /api/groups/{group_id}/awards/{edition_id}
  POST   /api/groups/{group_id}/awards/{edition_id}/categories
  DELETE /api/groups/{group_id}/awards/categories/{category_id}
  POST   /api/groups/{group_id}/awards/categories/{category_id}/vote
  DELETE /api/groups/{group_id}/awards/{edition_id}
"""

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from app.api.schemas.awards import (
    AwardCategoryDto,
    AwardEditionDto,
    AwardEditionStatus,
    AwardResultDto,
    VoteResponse,
)
from app.exceptions import ForbiddenError, NotFoundError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_edition(
    edition_id=None,
    status=AwardEditionStatus.DRAFT,
    title="2025 Season Awards",
    categories=None,
    can_vote=False,
    stat_awards=None,
) -> AwardEditionDto:
    return AwardEditionDto(
        id=edition_id or uuid4(),
        title=title,
        status=status,
        statAwards=stat_awards if stat_awards is not None else [],
        categories=categories or [],
        canVote=can_vote,
        createdAt=datetime.now(timezone.utc),
    )


def _make_category(category_id=None, title="MVP", description=None) -> AwardCategoryDto:
    return AwardCategoryDto(id=category_id or uuid4(), title=title, description=description)


# ---------------------------------------------------------------------------
# GET /api/groups/{group_id}/awards
# ---------------------------------------------------------------------------


class TestGetAwards:
    @patch("app.application.services.award_service.AwardService.get_awards")
    def test_get_awards_none(self, mock_get, client):
        """Group with no editions returns null."""
        gid = uuid4()
        mock_get.return_value = None

        response = client.get(f"/api/groups/{gid}/awards")

        assert response.status_code == 200
        assert response.json() is None

    @patch("app.application.services.award_service.AwardService.get_awards")
    def test_get_awards_open_hides_results(self, mock_get, client):
        """A VOTING_OPEN edition must not expose results/totalVotes on categories."""
        gid = uuid4()
        cat = _make_category(title="Most Improved")
        mock_get.return_value = _make_edition(
            status=AwardEditionStatus.VOTING_OPEN,
            categories=[cat],
            can_vote=True,
        )

        response = client.get(f"/api/groups/{gid}/awards")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "VOTING_OPEN"
        assert data["canVote"] is True
        assert data["statAwards"] == []
        assert len(data["categories"]) == 1
        # results/totalVotes are excluded (None) while voting is open.
        assert "results" not in data["categories"][0]
        assert "totalVotes" not in data["categories"][0]

    @patch("app.application.services.award_service.AwardService.get_awards")
    def test_get_awards_closed_shows_results(self, mock_get, client):
        """A CLOSED edition exposes results and totalVotes."""
        gid = uuid4()
        nominee = uuid4()
        cat = AwardCategoryDto(
            id=uuid4(),
            title="MVP",
            results=[
                AwardResultDto(
                    nomineeGroupPlayerId=nominee, displayName="Alice", votes=3
                )
            ],
            totalVotes=3,
        )
        mock_get.return_value = _make_edition(
            status=AwardEditionStatus.CLOSED, categories=[cat]
        )

        response = client.get(f"/api/groups/{gid}/awards")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "CLOSED"
        category = data["categories"][0]
        assert category["totalVotes"] == 3
        assert category["results"][0]["displayName"] == "Alice"
        assert category["results"][0]["votes"] == 3


# ---------------------------------------------------------------------------
# POST /api/groups/{group_id}/awards
# ---------------------------------------------------------------------------


class TestCreateEdition:
    @patch("app.application.services.award_service.AwardService.create_edition")
    def test_create_edition_success(self, mock_create, client):
        """Creating an edition returns 201 with a DRAFT edition."""
        gid = uuid4()
        eid = uuid4()
        mock_create.return_value = _make_edition(
            edition_id=eid, status=AwardEditionStatus.DRAFT, title="Playoff Awards"
        )

        response = client.post(
            f"/api/groups/{gid}/awards",
            json={
                "title": "Playoff Awards",
                "statAwards": [{"key": "top_scorer", "value": 42}],
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "DRAFT"
        assert data["title"] == "Playoff Awards"

    def test_create_edition_missing_title(self, client):
        """Missing title fails validation with 422."""
        gid = uuid4()
        response = client.post(
            f"/api/groups/{gid}/awards",
            json={"statAwards": []},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# PATCH /api/groups/{group_id}/awards/{edition_id}
# ---------------------------------------------------------------------------


class TestUpdateEdition:
    @patch("app.application.services.award_service.AwardService.update_edition")
    def test_patch_opens_voting(self, mock_update, client):
        """Transitioning an edition to VOTING_OPEN returns 200."""
        gid = uuid4()
        eid = uuid4()
        mock_update.return_value = _make_edition(
            edition_id=eid, status=AwardEditionStatus.VOTING_OPEN
        )

        response = client.patch(
            f"/api/groups/{gid}/awards/{eid}",
            json={"status": "VOTING_OPEN"},
        )

        assert response.status_code == 200
        assert response.json()["status"] == "VOTING_OPEN"

    def test_patch_invalid_status(self, client):
        """An unknown status value fails validation with 422."""
        gid = uuid4()
        eid = uuid4()
        response = client.patch(
            f"/api/groups/{gid}/awards/{eid}",
            json={"status": "NOPE"},
        )
        assert response.status_code == 422

    @patch("app.application.services.award_service.AwardService.update_edition")
    def test_patch_forbidden_non_organizer(self, mock_update, client):
        """A non-organizer patching an edition gets 403."""
        gid = uuid4()
        eid = uuid4()
        mock_update.side_effect = ForbiddenError(
            "Only owners and organizers can manage awards"
        )

        response = client.patch(
            f"/api/groups/{gid}/awards/{eid}",
            json={"title": "Renamed"},
        )

        assert response.status_code == 403


# ---------------------------------------------------------------------------
# Categories
# ---------------------------------------------------------------------------


class TestCategories:
    @patch("app.application.services.award_service.AwardService.add_category")
    def test_add_category_success(self, mock_add, client):
        """Adding a category returns 201 with the category."""
        gid = uuid4()
        eid = uuid4()
        cid = uuid4()
        mock_add.return_value = _make_category(
            category_id=cid, title="Best Dink", description="Softest hands"
        )

        response = client.post(
            f"/api/groups/{gid}/awards/{eid}/categories",
            json={"title": "Best Dink", "description": "Softest hands"},
        )

        assert response.status_code == 201
        data = response.json()
        assert data["title"] == "Best Dink"
        assert data["description"] == "Softest hands"

    @patch("app.application.services.award_service.AwardService.delete_category")
    def test_delete_category_success(self, mock_delete, client):
        """Deleting a category returns 204."""
        gid = uuid4()
        cid = uuid4()
        mock_delete.return_value = None

        response = client.delete(f"/api/groups/{gid}/awards/categories/{cid}")

        assert response.status_code == 204

    @patch("app.application.services.award_service.AwardService.delete_category")
    def test_delete_category_not_found(self, mock_delete, client):
        """Deleting a missing category returns 404."""
        gid = uuid4()
        cid = uuid4()
        mock_delete.side_effect = NotFoundError("Award category", str(cid))

        response = client.delete(f"/api/groups/{gid}/awards/categories/{cid}")

        assert response.status_code == 404


# ---------------------------------------------------------------------------
# Voting
# ---------------------------------------------------------------------------


class TestVote:
    @patch("app.application.services.award_service.AwardService.vote")
    def test_vote_success(self, mock_vote, client):
        """Casting a vote returns 200 with ok + myVote."""
        gid = uuid4()
        cid = uuid4()
        nominee = uuid4()
        mock_vote.return_value = VoteResponse(ok=True, myVote=nominee)

        response = client.post(
            f"/api/groups/{gid}/awards/categories/{cid}/vote",
            json={"nomineeGroupPlayerId": str(nominee)},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["ok"] is True
        assert data["myVote"] == str(nominee)

    def test_vote_missing_nominee(self, client):
        """Missing nomineeGroupPlayerId fails validation with 422."""
        gid = uuid4()
        cid = uuid4()
        response = client.post(
            f"/api/groups/{gid}/awards/categories/{cid}/vote",
            json={},
        )
        assert response.status_code == 422


# ---------------------------------------------------------------------------
# DELETE edition
# ---------------------------------------------------------------------------


class TestDeleteEdition:
    @patch("app.application.services.award_service.AwardService.delete_edition")
    def test_delete_edition_success(self, mock_delete, client):
        """Deleting an edition returns 204."""
        gid = uuid4()
        eid = uuid4()
        mock_delete.return_value = None

        response = client.delete(f"/api/groups/{gid}/awards/{eid}")

        assert response.status_code == 204


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------


class TestAwardsAuthRequired:
    def test_get_awards_no_auth(self):
        """GET without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.get(f"/api/groups/{uuid4()}/awards")

        assert response.status_code == 401
