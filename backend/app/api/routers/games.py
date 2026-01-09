from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.games import ScoreUpdateRequest, ScoreUpdateResponse, GameUpdatePlayersRequest
from app.application.services.event_service import EventService

router = APIRouter()


@router.patch("/games/{game_id}/score", response_model=ScoreUpdateResponse)
@limiter.limit(DEFAULT_RATE)
async def update_score(
    request: Request,
    game_id: UUID,
    data: ScoreUpdateRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update game score."""
    service = EventService(db)
    return await service.update_score(user.user_id, game_id, data.score_team1, data.score_team2)


@router.delete("/games/{game_id}")
@limiter.limit(DEFAULT_RATE)
async def delete_game(
    request: Request,
    game_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Delete a game and trigger rating recalculation."""
    service = EventService(db)
    await service.delete_game(user.user_id, game_id)
    return {"message": "Game deleted successfully"}


@router.patch("/games/{game_id}/players", response_model=ScoreUpdateResponse)
@limiter.limit(DEFAULT_RATE)
async def update_game_players(
    request: Request,
    game_id: UUID,
    data: GameUpdatePlayersRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update player positions in a game."""
    service = EventService(db)
    return await service.update_game_players(
        user.user_id, 
        game_id, 
        UUID(data.team1_p1),
        UUID(data.team1_p2),
        UUID(data.team2_p1),
        UUID(data.team2_p2)
    )








