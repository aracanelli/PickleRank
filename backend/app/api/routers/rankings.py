from datetime import datetime
from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query, Request, Response

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.rankings import MatchHistoryResponse, RankingsResponse
from app.application.services.ranking_service import RankingService
from app.infrastructure.cache import rankings_cache

router = APIRouter()


@router.get("/groups/{group_id}/rankings", response_model=RankingsResponse)
@limiter.limit(DEFAULT_RATE)
async def get_rankings(
    request: Request,
    group_id: UUID,
    response: Response,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get group rankings."""
    # Set browser cache header (1 minute)
    response.headers["Cache-Control"] = "public, max-age=60"
    
    # Check server-side cache first
    cache_key = f"rankings:{group_id}"
    cached = await rankings_cache.get(cache_key)
    if cached:
        return cached
    
    service = RankingService(db)
    rankings = await service.get_rankings(user.user_id, group_id)
    response_data = RankingsResponse(rankings=rankings)
    
    # Cache the response
    await rankings_cache.set(cache_key, response_data)
    return response_data


@router.get("/groups/{group_id}/history", response_model=MatchHistoryResponse)
@limiter.limit(DEFAULT_RATE)
async def get_match_history(
    request: Request,
    group_id: UUID,
    from_date: Optional[datetime] = Query(None, alias="from"),
    to_date: Optional[datetime] = Query(None, alias="to"),
    player_id: Optional[UUID] = Query(None, alias="playerId"),
    secondary_player_id: Optional[UUID] = Query(None, alias="secondaryPlayerId"),
    relationship: Optional[str] = Query("teammate", alias="relationship"),
    event_id: Optional[UUID] = Query(None, alias="eventId"),
    limit: Optional[int] = Query(None, ge=1, le=100),
    offset: Optional[int] = Query(None, ge=0),
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get match history with optional pagination."""
    service = RankingService(db)
    matches, total = await service.get_match_history(
        user.user_id, group_id, from_date, to_date, player_id, event_id, 
        secondary_player_id, relationship, limit, offset
    )
    
    has_more = None
    if limit is not None and offset is not None:
        has_more = (offset + len(matches)) < total
    
    return MatchHistoryResponse(
        matches=matches,
        total=total if limit is not None else None,
        limit=limit,
        offset=offset,
        has_more=has_more
    )







