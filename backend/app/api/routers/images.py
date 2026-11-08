"""
Player photos and league logos.

Uploads are the raw image bytes as the request body (no multipart, no filename).
The client's Content-Type and filename are ignored; the server decodes and re-encodes.
Reads need the bearer token, so the web app fetches them and shows an object URL.
"""
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request, Response

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, STRICT_RATE, limiter
from app.application.services.image_service import (
    MAX_UPLOAD_BYTES,
    ImageService,
    PayloadTooLargeError,
)
from app.exceptions import NotFoundError
from app.infrastructure.cache import group_cache

router = APIRouter()

IMAGE_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, max-age=86400",
}


async def _read_capped(request: Request) -> bytes:
    """Read the body, stopping as soon as it passes the cap (Content-Length can be absent or wrong)."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError()
    buf = bytearray()
    async for chunk in request.stream():
        buf += chunk
        if len(buf) > MAX_UPLOAD_BYTES:
            raise PayloadTooLargeError()
    return bytes(buf)


def _serve(image: dict | None) -> Response:
    if not image:
        raise NotFoundError("Image", "none")
    # mime comes from our own column (always image/webp today), never from the uploader
    return Response(content=bytes(image["data"]), media_type=image["mime"], headers=IMAGE_HEADERS)


async def _forget_cached_rosters(group_id: UUID) -> None:
    await group_cache.invalidate(f"group_players:{group_id}")


@router.put("/groups/{group_id}/players/{group_player_id}/photo")
@limiter.limit(STRICT_RATE)
async def put_player_photo(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Set a player's photo. The player themself, or an organizer/owner of the league."""
    raw = await _read_capped(request)
    version = await ImageService(db).set_player_photo(user.user_id, group_id, group_player_id, raw)
    await _forget_cached_rosters(group_id)
    return {"photoVersion": version}


@router.delete("/groups/{group_id}/players/{group_player_id}/photo", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def delete_player_photo(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    await ImageService(db).delete_player_photo(user.user_id, group_id, group_player_id)
    await _forget_cached_rosters(group_id)


@router.get("/groups/{group_id}/players/{group_player_id}/photo")
@limiter.limit(DEFAULT_RATE)
async def get_player_photo(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    return _serve(await ImageService(db).get_player_photo(user.user_id, group_id, group_player_id))


@router.put("/groups/{group_id}/logo")
@limiter.limit(STRICT_RATE)
async def put_group_logo(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """Set the league logo. Organizers and the owner only."""
    raw = await _read_capped(request)
    version = await ImageService(db).set_group_logo(user.user_id, group_id, raw)
    return {"logoVersion": version}


@router.delete("/groups/{group_id}/logo", status_code=204)
@limiter.limit(DEFAULT_RATE)
async def delete_group_logo(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    await ImageService(db).delete_group_logo(user.user_id, group_id)


@router.get("/groups/{group_id}/logo")
@limiter.limit(DEFAULT_RATE)
async def get_group_logo(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    return _serve(await ImageService(db).get_group_logo(user.user_id, group_id))
