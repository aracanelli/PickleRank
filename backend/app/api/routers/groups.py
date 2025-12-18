from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.groups import (
    GroupCreate,
    GroupListResponse,
    GroupResponse,
    GroupSettingsUpdate,
    GroupUpdate,
)
from app.api.schemas.players import PlayerStats
from app.application.services.group_service import GroupService

router = APIRouter()


@router.post("/groups", response_model=GroupResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def create_group(
    request: Request,
    data: GroupCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Create a new group."""
    service = GroupService(db)
    return await service.create_group(user.user_id, data)


@router.get("/groups", response_model=GroupListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_groups(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List all groups owned by the current user."""
    service = GroupService(db)
    groups = await service.list_groups(user.user_id)
    return GroupListResponse(groups=groups)


@router.get("/groups/member", response_model=GroupListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_member_groups(
    request: Request,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List all groups where the current user is a member (via linked player)."""
    service = GroupService(db)
    groups = await service.list_member_groups(user.user_id)
    return GroupListResponse(groups=groups)


@router.get("/groups/{group_id}", response_model=GroupResponse)
@limiter.limit(DEFAULT_RATE)
async def get_group(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get a specific group."""
    service = GroupService(db)
    return await service.get_group(user.user_id, group_id)



@router.get("/groups/{group_id}/players/{player_id}/stats", response_model=PlayerStats)
@limiter.limit(DEFAULT_RATE)
async def get_player_stats(
    request: Request,
    group_id: UUID,
    player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get player stats and history."""
    service = GroupService(db)
    return await service.get_player_stats(user.user_id, group_id, player_id)


@router.patch("/groups/{group_id}/settings", response_model=GroupResponse)
@limiter.limit(DEFAULT_RATE)
async def update_group_settings(
    request: Request,
    group_id: UUID,
    data: GroupSettingsUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update group settings."""
    service = GroupService(db)
    return await service.update_settings(user.user_id, group_id, data)


@router.patch("/groups/{group_id}", response_model=GroupResponse)
@limiter.limit(DEFAULT_RATE)
async def update_group(
    request: Request,
    group_id: UUID,
    data: GroupUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update group name."""
    service = GroupService(db)
    return await service.update_group(user.user_id, group_id, data.name)


@router.post("/groups/{group_id}/recalculate-ratings")
@limiter.limit(DEFAULT_RATE)
async def recalculate_ratings(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Recalculate all player ratings from scratch.
    
    Resets all ratings to initial value, then replays all completed events
    in chronological order to recalculate ratings.
    """
    service = GroupService(db)
    return await service.recalculate_ratings(user.user_id, group_id)


@router.post("/groups/{group_id}/archive", response_model=GroupResponse)
@limiter.limit(DEFAULT_RATE)
async def archive_group(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Archive a group."""
    service = GroupService(db)
    return await service.archive_group(user.user_id, group_id)


@router.post("/groups/{group_id}/duplicate", response_model=GroupResponse)
@limiter.limit(DEFAULT_RATE)
async def duplicate_group(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Duplicate a group with players and settings, but without history.
    
    Creates a new group with the same settings and players (with reset ratings),
    but no events, games, or rating history.
    """
    service = GroupService(db)
    return await service.duplicate_group(user.user_id, group_id)
