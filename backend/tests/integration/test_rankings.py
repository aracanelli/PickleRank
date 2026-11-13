"""
Integration tests for GET /api/groups/{group_id}/rankings caching.
"""

import asyncio
from unittest.mock import patch
from uuid import uuid4

import pytest

from app.api.schemas.rankings import RankingsResponse
from app.exceptions import ForbiddenError
from app.infrastructure.cache import rankings_cache


@pytest.fixture()
def cached_group():
    group_id = uuid4()
    asyncio.run(rankings_cache.set(f"rankings:{group_id}", RankingsResponse(rankings=[])))
    yield group_id
    asyncio.run(rankings_cache.invalidate(f"rankings:{group_id}"))


class TestRankingsCache:
    @patch("app.application.services.ranking_service.RankingService.ensure_access")
    def test_cached_rankings_still_require_access(self, mock_access, client, cached_group):
        """A warm cache must not leak one group's rankings to a non-member."""
        mock_access.side_effect = ForbiddenError("You don't have access to this group")
        response = client.get(f"/api/groups/{cached_group}/rankings")
        assert response.status_code == 403

    @patch("app.application.services.ranking_service.RankingService.list_rankings")
    @patch("app.application.services.ranking_service.RankingService.ensure_access")
    def test_member_gets_cached_rankings(self, mock_access, mock_list, client, cached_group):
        mock_access.return_value = None
        response = client.get(f"/api/groups/{cached_group}/rankings")
        assert response.status_code == 200
        assert response.json() == {"rankings": []}
        mock_list.assert_not_called()
