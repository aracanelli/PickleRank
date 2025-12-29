from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.games import ScoreUpdateRequest, ScoreUpdateResponse
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







