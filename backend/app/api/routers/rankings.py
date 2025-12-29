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
from app.exceptions import ForbiddenError, NotFoundError
from app.infrastructure.cache import rankings_cache
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository

router = APIRouter()


async def verify_group_membership(user_id: str, group_id: UUID, db: Connection) -> None:
    """Verify that user has access to the group (owner or member).
    
    Raises:
        NotFoundError: If group does not exist
        ForbiddenError: If user is not authorized to access the group
    """
    groups_repo = GroupsRepository(db)
    group = await groups_repo.get_by_id(group_id)
    if not group:
        raise NotFoundError("Group", str(group_id))
    if str(group["owner_user_id"]) != user_id:
        group_players_repo = GroupPlayersRepository(db)
        is_member = await group_players_repo.is_member(user_id, group_id)
        if not is_member:
            raise ForbiddenError("You don't have access to this group")


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
    # SECURITY: Authorize BEFORE checking cache to prevent unauthorized cache access
    await verify_group_membership(user.user_id, group_id, db)
    
    # Set browser cache header (1 minute)
    response.headers["Cache-Control"] = "private, max-age=60"    
    # Check server-side cache (safe now that user is authorized)
    cache_key = f"rankings:{group_id}"
    cached = await rankings_cache.get(cache_key)
    if cached:
        return cached
    
    service = RankingService(db)
    # Pass skip_auth=True since we already verified membership above
    rankings = await service.get_rankings(user.user_id, group_id, skip_auth=True)
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
    if limit is not None:
        offset_for_calc = offset if offset is not None else 0
        has_more = (offset_for_calc + len(matches)) < total
    
    return MatchHistoryResponse(
        matches=matches,
        total=total if limit is not None else None,
        limit=limit,
        offset=offset,
        has_more=has_more
    )







