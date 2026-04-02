"""
Integration tests for event endpoints.

Covers:
  POST   /api/groups/{group_id}/events
  GET    /api/groups/{group_id}/events
  GET    /api/events/{event_id}
  DELETE /api/events/{event_id}
  PATCH  /api/events/{event_id}
"""

from datetime import datetime, timezone
from unittest.mock import patch
from uuid import uuid4

from app.api.schemas.events import (
    EventListItem,
    EventResponse,
    EventStatus,
)
from app.exceptions import NotFoundError

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_event_response(
    event_id=None,
    group_id=None,
    status=EventStatus.DRAFT,
    name="Test Event",
    courts=2,
    rounds=3,
) -> EventResponse:
    return EventResponse(
        id=event_id or uuid4(),
        groupId=group_id or uuid4(),
        name=name,
        status=status,
        startsAt=datetime.now(timezone.utc),
        courts=courts,
        rounds=rounds,
        participantCount=courts * 4,
        generationMeta=None,
        games=[],
    )


def _make_event_list_item(
    event_id=None,
    group_id=None,
    status=EventStatus.DRAFT,
    name="Test Event",
) -> EventListItem:
    return EventListItem(
        id=event_id or uuid4(),
        groupId=group_id or uuid4(),
        name=name,
        status=status,
        startsAt=datetime.now(timezone.utc),
        courts=2,
        rounds=3,
    )


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestCreateEvent:
    """POST /api/groups/{group_id}/events"""

    @patch("app.application.services.event_service.EventService.create_event")
    def test_create_event_success(self, mock_create, client):
        """Creating an event returns 201 with event data."""
        gid = uuid4()
        eid = uuid4()
        participant_ids = [uuid4() for _ in range(8)]

        mock_create.return_value = _make_event_response(
            event_id=eid, group_id=gid, courts=2, rounds=3
        )

        response = client.post(
            f"/api/groups/{gid}/events",
            json={
                "courts": 2,
                "rounds": 3,
                "participantIds": [str(p) for p in participant_ids],
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert data["status"] == "DRAFT"
        assert data["courts"] == 2
        assert data["rounds"] == 3

    def test_create_event_invalid_courts(self, client):
        """Courts value of 0 should fail validation."""
        gid = uuid4()
        response = client.post(
            f"/api/groups/{gid}/events",
            json={
                "courts": 0,
                "rounds": 1,
                "participantIds": [str(uuid4())],
            },
        )
        assert response.status_code == 422

    def test_create_event_missing_participants(self, client):
        """Missing participantIds should fail validation."""
        gid = uuid4()
        response = client.post(
            f"/api/groups/{gid}/events",
            json={"courts": 1, "rounds": 1},
        )
        assert response.status_code == 422

    def test_create_event_invalid_rounds(self, client):
        """Rounds value of 0 should fail validation."""
        gid = uuid4()
        response = client.post(
            f"/api/groups/{gid}/events",
            json={
                "courts": 1,
                "rounds": 0,
                "participantIds": [str(uuid4()) for _ in range(4)],
            },
        )
        assert response.status_code == 422


class TestListEvents:
    """GET /api/groups/{group_id}/events"""

    @patch("app.application.services.event_service.EventService.list_events")
    def test_list_events_empty(self, mock_list, client):
        """Listing events for a group with none returns empty list."""
        gid = uuid4()
        mock_list.return_value = []

        response = client.get(f"/api/groups/{gid}/events")

        assert response.status_code == 200
        assert response.json()["events"] == []

    @patch("app.application.services.event_service.EventService.list_events")
    def test_list_events_with_status_filter(self, mock_list, client):
        """Listing events with a status query parameter works."""
        gid = uuid4()
        mock_list.return_value = [
            _make_event_list_item(group_id=gid, status=EventStatus.COMPLETED, name="Past Event")
        ]

        response = client.get(f"/api/groups/{gid}/events?status=COMPLETED")

        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 1
        assert data["events"][0]["status"] == "COMPLETED"

    @patch("app.application.services.event_service.EventService.list_events")
    def test_list_events_with_data(self, mock_list, client):
        """Listing events with multiple items."""
        gid = uuid4()
        mock_list.return_value = [
            _make_event_list_item(group_id=gid, name="Event 1"),
            _make_event_list_item(group_id=gid, name="Event 2"),
        ]

        response = client.get(f"/api/groups/{gid}/events")

        assert response.status_code == 200
        data = response.json()
        assert len(data["events"]) == 2


class TestGetEvent:
    """GET /api/events/{event_id}"""

    @patch("app.application.services.event_service.EventService.get_event")
    def test_get_event_success(self, mock_get, client):
        """Getting an event returns 200 with full details."""
        eid = uuid4()
        gid = uuid4()
        mock_get.return_value = _make_event_response(
            event_id=eid, group_id=gid, name="Friday Night"
        )

        response = client.get(f"/api/events/{eid}")

        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "Friday Night"
        assert data["games"] == []

    @patch("app.application.services.event_service.EventService.get_event")
    def test_get_event_not_found(self, mock_get, client):
        """Getting a non-existent event returns 404."""
        eid = uuid4()
        mock_get.side_effect = NotFoundError("Event", str(eid))

        response = client.get(f"/api/events/{eid}")

        assert response.status_code == 404


class TestDeleteEvent:
    """DELETE /api/events/{event_id}"""

    @patch("app.application.services.event_service.EventService.delete_event")
    def test_delete_draft_event_success(self, mock_delete, client):
        """Deleting a draft event returns 200."""
        eid = uuid4()
        mock_delete.return_value = None

        response = client.delete(f"/api/events/{eid}")

        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

    @patch("app.application.services.event_service.EventService.delete_event")
    def test_delete_event_not_found(self, mock_delete, client):
        """Deleting a non-existent event returns 404."""
        eid = uuid4()
        mock_delete.side_effect = NotFoundError("Event", str(eid))

        response = client.delete(f"/api/events/{eid}")

        assert response.status_code == 404


class TestEventAuthRequired:
    """Verify event endpoints require authentication."""

    def test_list_events_no_auth(self):
        """GET /api/groups/{id}/events without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.get(f"/api/groups/{uuid4()}/events")

        assert response.status_code == 401

    def test_get_event_no_auth(self):
        """GET /api/events/{id} without auth returns 401."""
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.get(f"/api/events/{uuid4()}")

        assert response.status_code == 401
