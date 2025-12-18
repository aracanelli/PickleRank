import csv
import io
from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, STRICT_RATE, limiter
from app.api.schemas.events import (
    CompleteResponse,
    EventCreate,
    EventListResponse,
    EventResponse,
    EventStatus,
    GenerateRequest,
    GenerateResponse,
    SwapRequest,
    SwapResponse,
)
from app.api.schemas.event_updates import EventUpdate
from app.application.services.event_service import EventService

router = APIRouter()


@router.post("/groups/{group_id}/events", response_model=EventResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def create_event(
    request: Request,
    group_id: UUID,
    data: EventCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Create a new event."""
    import traceback
    from app.logging_config import get_logger
    logger = get_logger(__name__)
    
    try:
        logger.info(f"Creating event for group {group_id}, user {user.user_id}")
        service = EventService(db)
        return await service.create_event(user.user_id, group_id, data)
    except Exception as e:
        logger.error(f"Error creating event: {e}")
        logger.error(traceback.format_exc())
        raise


@router.get("/groups/{group_id}/events", response_model=EventListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_events(
    request: Request,
    group_id: UUID,
    status: Optional[EventStatus] = Query(None),
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List all events in a group."""
    service = EventService(db)
    events = await service.list_events(user.user_id, group_id, status)
    return EventListResponse(events=events)


@router.get("/events/{event_id}", response_model=EventResponse)
@limiter.limit(DEFAULT_RATE)
async def get_event(
    request: Request,
    event_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get event details with games."""
    service = EventService(db)
    return await service.get_event(user.user_id, event_id)


@router.patch("/events/{event_id}", response_model=EventResponse)
@limiter.limit(DEFAULT_RATE)
async def update_event(
    request: Request,
    event_id: UUID,
    data: EventUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update event details."""
    service = EventService(db)
    return await service.update_event(user.user_id, event_id, data)


@router.post("/events/{event_id}/generate", response_model=GenerateResponse)
@limiter.limit(STRICT_RATE)
async def generate_schedule(
    request: Request,
    event_id: UUID,
    data: Optional[GenerateRequest] = None,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Generate match schedule for an event."""
    service = EventService(db)
    new_seed = data.new_seed if data else False
    return await service.generate_schedule(user.user_id, event_id, new_seed)


@router.post("/events/{event_id}/swap", response_model=SwapResponse)
@limiter.limit(DEFAULT_RATE)
async def swap_players(
    request: Request,
    event_id: UUID,
    data: SwapRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Swap two players within a round."""
    service = EventService(db)
    return await service.swap_players(
        user.user_id, event_id, data.round_index, data.player1_id, data.player2_id
    )


@router.post("/events/{event_id}/complete", response_model=CompleteResponse)
@limiter.limit(DEFAULT_RATE)
async def complete_event(
    request: Request,
    event_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Complete an event and update ratings."""
    service = EventService(db)
    return await service.complete_event(user.user_id, event_id)


@router.delete("/events/{event_id}")
@limiter.limit(DEFAULT_RATE)
async def delete_event(
    request: Request,
    event_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Delete an event (only if not completed)."""
    service = EventService(db)
    await service.delete_event(user.user_id, event_id)
    return {"message": "Event deleted successfully"}


@router.get("/groups/{group_id}/history/import/template")
@limiter.limit(DEFAULT_RATE)
async def download_import_template(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
):
    """Download CSV template for history import."""
    # Verify group ownership
    from app.infrastructure.repositories.groups_repo import GroupsRepository
    from app.infrastructure.db.connection import get_db_pool
    
    pool = await get_db_pool()
    async with pool.acquire() as conn:
        groups_repo = GroupsRepository(conn)
        group = await groups_repo.get_by_id(group_id)
        if not group:
            from app.exceptions import NotFoundError
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user.user_id:
            from app.exceptions import ForbiddenError
            raise ForbiddenError("You don't own this group")
    
    # Create CSV template
    template = """event_name,event_date,round_index,court_index,team1_player1,team1_player2,team2_player1,team2_player2,score_team1,score_team2
Friday Night 1,2024-01-15,0,0,John Doe,Jane Smith,Bob Wilson,Alice Brown,11,9
Friday Night 1,2024-01-15,0,1,Charlie Davis,Diana Lee,Frank Miller,Grace Park,9,11
Friday Night 1,2024-01-15,1,0,John Doe,Charlie Davis,Jane Smith,Diana Lee,11,7
"""
    
    return Response(
        content=template,
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=history_import_template.csv"}
    )


@router.post("/groups/{group_id}/history/import")
@limiter.limit(STRICT_RATE)
async def import_history(
    request: Request,
    group_id: UUID,
    file: UploadFile = File(...),
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Import historical game data from CSV."""
    service = EventService(db)
    return await service.import_history(user.user_id, group_id, file)


@router.get("/events/{event_id}/rating-history")
@limiter.limit(DEFAULT_RATE)
async def get_event_rating_history(
    request: Request,
    event_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get round-by-round rating history for an event."""
    service = EventService(db)
    return await service.get_event_rating_history(user.user_id, event_id)
