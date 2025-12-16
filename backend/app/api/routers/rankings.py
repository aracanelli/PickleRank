from datetime import datetime
from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.rankings import MatchHistoryResponse, RankingsResponse
from app.application.services.ranking_service import RankingService

router = APIRouter()


@router.get("/groups/{group_id}/rankings", response_model=RankingsResponse)
@limiter.limit(DEFAULT_RATE)
async def get_rankings(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get group rankings."""
    service = RankingService(db)
    rankings = await service.get_rankings(user.user_id, group_id)
    return RankingsResponse(rankings=rankings)


@router.get("/groups/{group_id}/history", response_model=MatchHistoryResponse)
@limiter.limit(DEFAULT_RATE)
async def get_match_history(
    request: Request,
    group_id: UUID,
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    player_id: Optional[UUID] = Query(None, alias="playerId"),
    event_id: Optional[UUID] = Query(None, alias="eventId"),
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get match history."""
    service = RankingService(db)
    matches = await service.get_match_history(
        user.user_id, group_id, from_date, to_date, player_id, event_id
    )
    return MatchHistoryResponse(matches=matches)




