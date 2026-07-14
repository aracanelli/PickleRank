from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import AUTH_RATE, DEFAULT_RATE, limiter
from app.api.schemas.spond import (
    SpondConfirmLinksRequest,
    SpondConfirmLinksResponse,
    SpondConnectRequest,
    SpondEventListResponse,
    SpondGroupLinkResponse,
    SpondGroupListResponse,
    SpondLinkGroupRequest,
    SpondResolveResponse,
    SpondStatusResponse,
)
from app.application.services.spond_service import SpondService

router = APIRouter()


@router.post("/spond/connect", response_model=SpondStatusResponse)
@limiter.limit(AUTH_RATE)
async def connect_spond(
    request: Request,
    data: SpondConnectRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Connect the current user's Spond account (validates and stores credentials)."""
    service = SpondService(db)
    return await service.connect(user.user_id, data.email, data.password)


@router.get("/spond/status", response_model=SpondStatusResponse)
@limiter.limit(DEFAULT_RATE)
async def spond_status(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Whether the current user has a connected Spond account."""
    service = SpondService(db)
    return await service.get_status(user.user_id)


@router.delete("/spond/disconnect", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def disconnect_spond(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Remove the current user's stored Spond account."""
    service = SpondService(db)
    await service.disconnect(user.user_id)


@router.get("/spond/groups", response_model=SpondGroupListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_spond_groups(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List the Spond groups the connected account belongs to."""
    service = SpondService(db)
    return await service.list_spond_groups(user.user_id)


@router.get("/spond/groups/{group_id}/link", response_model=SpondGroupLinkResponse)
@limiter.limit(DEFAULT_RATE)
async def get_spond_group_link(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get the Spond group mapped to this PickleRank group (if any)."""
    service = SpondService(db)
    return await service.get_group_link(user.user_id, group_id)


@router.put("/spond/groups/{group_id}/link", response_model=SpondGroupLinkResponse)
@limiter.limit(DEFAULT_RATE)
async def set_spond_group_link(
    request: Request,
    group_id: UUID,
    data: SpondLinkGroupRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Map this PickleRank group to a Spond group."""
    service = SpondService(db)
    return await service.link_group(user.user_id, group_id, data.spond_group_id)


@router.get("/spond/groups/{group_id}/events", response_model=SpondEventListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_spond_events(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List upcoming events for the linked Spond group, soonest first."""
    service = SpondService(db)
    return await service.list_events(user.user_id, group_id)


@router.get(
    "/spond/groups/{group_id}/events/{spond_event_id}/resolve",
    response_model=SpondResolveResponse,
)
@limiter.limit(DEFAULT_RATE)
async def resolve_spond_event(
    request: Request,
    group_id: UUID,
    spond_event_id: str,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Resolve an event's accepted attendees against this group's roster."""
    service = SpondService(db)
    return await service.resolve_event(user.user_id, group_id, spond_event_id)


@router.post(
    "/spond/groups/{group_id}/events/{spond_event_id}/confirm",
    response_model=SpondConfirmLinksResponse,
)
@limiter.limit(DEFAULT_RATE)
async def confirm_spond_links(
    request: Request,
    group_id: UUID,
    spond_event_id: str,
    data: SpondConfirmLinksRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Persist attendee->player links and return group_player IDs to select."""
    service = SpondService(db)
    return await service.confirm_links(user.user_id, group_id, data.links)
