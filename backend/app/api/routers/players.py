from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Query, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.players import (
    AddPlayerToGroupRequest,
    BulkAddPlayersToGroupRequest,
    BulkAddPlayersToGroupResponse,
    BulkPlayerCreate,
    BulkPlayerCreateResponse,
    GroupPlayerListResponse,
    GroupPlayerResponse,
    PlayerCreate,
    PlayerListResponse,
    PlayerResponse,
    PlayerUpdate,
    UpdateGroupPlayerRequest,
)
from app.application.services.player_service import PlayerService

router = APIRouter()


@router.post("/players", response_model=PlayerResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def create_player(
    request: Request,
    data: PlayerCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Create a new global player."""
    service = PlayerService(db)
    return await service.create_player(user.user_id, data)


@router.post("/players/bulk", response_model=BulkPlayerCreateResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def bulk_create_players(
    request: Request,
    data: BulkPlayerCreate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Create multiple players at once."""
    service = PlayerService(db)
    return await service.bulk_create_players(user.user_id, data)


@router.get("/players", response_model=PlayerListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_players(
    request: Request,
    search: Optional[str] = Query(None, max_length=100),
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List all global players owned by the user."""
    service = PlayerService(db)
    players = await service.list_players(user.user_id, search)
    return PlayerListResponse(players=players)


@router.get("/players/{player_id}", response_model=PlayerResponse)
@limiter.limit(DEFAULT_RATE)
async def get_player(
    request: Request,
    player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get a specific player."""
    service = PlayerService(db)
    return await service.get_player(user.user_id, player_id)


@router.patch("/players/{player_id}", response_model=PlayerResponse)
@limiter.limit(DEFAULT_RATE)
async def update_player(
    request: Request,
    player_id: UUID,
    data: PlayerUpdate,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update a player."""
    service = PlayerService(db)
    return await service.update_player(user.user_id, player_id, data)


@router.post(
    "/groups/{group_id}/players", response_model=GroupPlayerResponse, status_code=201
)
@limiter.limit(DEFAULT_RATE)
async def add_player_to_group(
    request: Request,
    group_id: UUID,
    data: AddPlayerToGroupRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Add a player to a group."""
    service = PlayerService(db)
    return await service.add_player_to_group(
        user.user_id, group_id, data.player_id, data.membership_type, data.skill_level
    )


@router.post(
    "/groups/{group_id}/players/bulk",
    response_model=BulkAddPlayersToGroupResponse,
    status_code=201,
)
@limiter.limit(DEFAULT_RATE)
async def bulk_add_players_to_group(
    request: Request,
    group_id: UUID,
    data: BulkAddPlayersToGroupRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Add multiple players to a group at once."""
    service = PlayerService(db)
    return await service.bulk_add_players_to_group(user.user_id, group_id, data)


@router.get("/groups/{group_id}/players", response_model=GroupPlayerListResponse)
@limiter.limit(DEFAULT_RATE)
async def list_group_players(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """List all players in a group with their ratings."""
    service = PlayerService(db)
    players = await service.list_group_players(user.user_id, group_id)
    return GroupPlayerListResponse(players=players)


@router.patch(
    "/groups/{group_id}/players/{group_player_id}", response_model=GroupPlayerResponse
)
@limiter.limit(DEFAULT_RATE)
async def update_group_player(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    data: UpdateGroupPlayerRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update a group player's membership type."""
    service = PlayerService(db)
    return await service.update_group_player(
        user.user_id, group_id, group_player_id, data
    )


@router.delete("/groups/{group_id}/players/{group_player_id}", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def remove_player_from_group(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Remove a player from a group."""
    service = PlayerService(db)
    await service.remove_player_from_group(user.user_id, group_id, group_player_id)




