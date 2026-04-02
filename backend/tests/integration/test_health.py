"""
Integration tests for the /api/health endpoint.
"""


class TestHealthEndpoint:
    """Tests for the health check route."""

    def test_health_returns_200(self, client):
        """GET /api/health should return 200 with status healthy."""
        response = client.get("/api/health")

        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert "timestamp" in data

    def test_health_does_not_require_auth(self):
        """Health endpoint should work even without auth header.

        We create a separate client *without* the auth override so the
        real dependency would fire.  Because /api/health doesn't declare
        auth as a dependency, it should still succeed.
        """
        from fastapi.testclient import TestClient

        from app.main import create_app

        app = create_app()
        with TestClient(app, raise_server_exceptions=False) as c:
            response = c.get("/api/health")

        assert response.status_code == 200
        assert response.json()["status"] == "healthy"

    def test_health_timestamp_is_iso_format(self, client):
        """The timestamp should be a valid ISO-8601 string."""
        from datetime import datetime

        response = client.get("/api/health")
        data = response.json()
        # Should not raise
        parsed = datetime.fromisoformat(data["timestamp"])
        assert parsed is not None
