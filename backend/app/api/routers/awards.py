"""Awards feature API endpoints."""
from typing import Optional
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.awards import (
    AwardCategoryDto,
    AwardEditionDto,
    CreateCategoryRequest,
    CreateEditionRequest,
    UpdateEditionRequest,
    VoteRequest,
    VoteResponse,
)
from app.application.services.award_service import AwardService

router = APIRouter()


@router.get(
    "/groups/{group_id}/awards",
    response_model=Optional[AwardEditionDto],
    response_model_exclude_none=True,
)
@limiter.limit(DEFAULT_RATE)
async def get_awards(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Get the latest award edition for a group (owner or member), or null."""
    service = AwardService(db)
    return await service.get_awards(user.user_id, group_id)


@router.post(
    "/groups/{group_id}/awards",
    response_model=AwardEditionDto,
    response_model_exclude_none=True,
    status_code=201,
)
@limiter.limit(DEFAULT_RATE)
async def create_edition(
    request: Request,
    group_id: UUID,
    data: CreateEditionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Create a DRAFT award edition (organizer)."""
    service = AwardService(db)
    return await service.create_edition(
        user.user_id, group_id, data.title, data.stat_awards
    )


@router.patch(
    "/groups/{group_id}/awards/{edition_id}",
    response_model=AwardEditionDto,
    response_model_exclude_none=True,
)
@limiter.limit(DEFAULT_RATE)
async def update_edition(
    request: Request,
    group_id: UUID,
    edition_id: UUID,
    data: UpdateEditionRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Update an award edition's title and/or status (organizer)."""
    service = AwardService(db)
    return await service.update_edition(
        user.user_id, group_id, edition_id, data.title, data.status
    )


@router.post(
    "/groups/{group_id}/awards/{edition_id}/categories",
    response_model=AwardCategoryDto,
    response_model_exclude_none=True,
    status_code=201,
)
@limiter.limit(DEFAULT_RATE)
async def add_category(
    request: Request,
    group_id: UUID,
    edition_id: UUID,
    data: CreateCategoryRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Add a voting category to an edition (organizer)."""
    service = AwardService(db)
    return await service.add_category(
        user.user_id, group_id, edition_id, data.title, data.description
    )


@router.delete("/groups/{group_id}/awards/categories/{category_id}", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def delete_category(
    request: Request,
    group_id: UUID,
    category_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Delete a voting category (organizer)."""
    service = AwardService(db)
    await service.delete_category(user.user_id, group_id, category_id)
    return Response(status_code=204)


@router.post(
    "/groups/{group_id}/awards/categories/{category_id}/vote",
    response_model=VoteResponse,
)
@limiter.limit(DEFAULT_RATE)
async def vote(
    request: Request,
    group_id: UUID,
    category_id: UUID,
    data: VoteRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Cast or update a vote in a category (member with a linked player)."""
    service = AwardService(db)
    return await service.vote(
        user.user_id, group_id, category_id, data.nominee_group_player_id
    )


@router.delete("/groups/{group_id}/awards/{edition_id}", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def delete_edition(
    request: Request,
    group_id: UUID,
    edition_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Delete an award edition (organizer)."""
    service = AwardService(db)
    await service.delete_edition(user.user_id, group_id, edition_id)
    return Response(status_code=204)
