"""
Image service - player photos and league logos.

Uploads are untrusted. They are size-capped before decoding, decoded with an
allowlist of formats, checked for decompression bombs, then re-encoded to a
small WebP. The uploaded bytes are never stored or served.
"""
from io import BytesIO
from typing import List, Optional, Tuple
from uuid import UUID

from asyncpg import Connection

from app.exceptions import AppException, ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.images_repo import ImagesRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository

# 2 MB matches the API-wide request cap in app.main and stays under Vercel's 4.5 MB body limit.
# The web app downscales before upload, so real uploads are far smaller.
MAX_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_SIDE = 512
# A 2 MB file has no business holding more than ~6300 x 6300 pixels.
MAX_INPUT_PIXELS = 40_000_000
ALLOWED_FORMATS = ("JPEG", "PNG", "WEBP")
OUTPUT_MIME = "image/webp"


class PayloadTooLargeError(AppException):
    def __init__(self):
        super().__init__(status_code=413, detail="Image is too big. The limit is 2 MB.")


class UnsupportedImageError(AppException):
    def __init__(self):
        super().__init__(status_code=415, detail="Use a JPEG, PNG or WebP image.")


def normalize_image(raw: bytes) -> Tuple[bytes, int, int]:
    """Decode an untrusted upload and return (webp_bytes, width, height). Metadata is dropped."""
    if len(raw) > MAX_UPLOAD_BYTES:
        raise PayloadTooLargeError()
    # Imported here so cold starts that never touch images don't pay for Pillow.
    from PIL import Image, ImageOps, UnidentifiedImageError

    # Pillow raises DecompressionBombError past 2x this; we also check dimensions ourselves before load.
    Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS
    try:
        with Image.open(BytesIO(raw), formats=ALLOWED_FORMATS) as img:
            if img.format not in ALLOWED_FORMATS:
                raise UnsupportedImageError()
            if img.width * img.height > MAX_INPUT_PIXELS:
                raise UnsupportedImageError()
            img.seek(0)  # animated PNG/WebP: keep the first frame only
            img.load()
            upright = ImageOps.exif_transpose(img)
            mode = "RGBA" if "A" in upright.getbands() or "transparency" in upright.info else "RGB"
            upright = upright.convert(mode)
            upright.thumbnail((MAX_SIDE, MAX_SIDE), Image.Resampling.LANCZOS)
            # Rebuild from raw pixels so no EXIF, XMP, ICC or other chunk can ride along.
            clean = Image.frombytes(mode, upright.size, upright.tobytes())
    except UnsupportedImageError:
        raise
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError, SyntaxError, EOFError):
        raise UnsupportedImageError()

    out = BytesIO()
    clean.save(out, format="WEBP", quality=82, method=4)
    return out.getvalue(), clean.width, clean.height


class ImageService:
    """Permissions and storage for player photos and league logos."""

    def __init__(self, conn: Connection):
        self.images_repo = ImagesRepository(conn)
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)

    # ------------------------------------------------------------------
    # Permission helpers (same rules as the roster and awards)
    # ------------------------------------------------------------------

    async def _require_group(self, group_id: UUID) -> dict:
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        return group

    async def _is_owner_or_organizer(self, user_id: str, group: dict) -> bool:
        if str(group["owner_user_id"]) == user_id:
            return True
        return await self.group_players_repo.is_organizer(user_id, group["id"])

    async def _require_member(self, user_id: str, group: dict) -> None:
        if str(group["owner_user_id"]) == user_id:
            return
        if not await self.group_players_repo.is_member(user_id, group["id"]):
            raise ForbiddenError("You do not have access to this group")

    async def _require_photo_editor(self, user_id: str, group_id: UUID, group_player_id: UUID) -> dict:
        """Organizers and the owner may edit any player's photo; a linked player only their own. Returns the membership row."""
        group = await self._require_group(group_id)
        gp = await self.images_repo.get_group_player(group_id, group_player_id)
        if not gp:
            raise NotFoundError("Player", str(group_player_id))
        if gp["user_id"] is not None and str(gp["user_id"]) == user_id:
            return gp
        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only organizers or the player can change this photo")
        return gp

    async def _require_logo_editor(self, user_id: str, group_id: UUID) -> None:
        group = await self._require_group(group_id)
        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only organizers can change the league logo")

    # ------------------------------------------------------------------
    # Use cases
    # ------------------------------------------------------------------

    # A photo belongs to the player (players.id), not to one league membership,
    # so it shows in every league they play in. Returns those leagues so callers can refresh rosters.
    async def set_player_photo(self, user_id: str, group_id: UUID, group_player_id: UUID, raw: bytes) -> Tuple[int, List[UUID]]:
        gp = await self._require_photo_editor(user_id, group_id, group_player_id)
        data, w, h = normalize_image(raw)
        version = await self.images_repo.upsert("player", gp["player_id"], OUTPUT_MIME, data, w, h)
        return version, await self.images_repo.league_ids_of(gp["player_id"])

    async def delete_player_photo(self, user_id: str, group_id: UUID, group_player_id: UUID) -> List[UUID]:
        gp = await self._require_photo_editor(user_id, group_id, group_player_id)
        await self.images_repo.delete("player", gp["player_id"])
        return await self.images_repo.league_ids_of(gp["player_id"])

    async def set_group_logo(self, user_id: str, group_id: UUID, raw: bytes) -> int:
        await self._require_logo_editor(user_id, group_id)
        data, w, h = normalize_image(raw)
        return await self.images_repo.upsert("group", group_id, OUTPUT_MIME, data, w, h)

    async def delete_group_logo(self, user_id: str, group_id: UUID) -> None:
        await self._require_logo_editor(user_id, group_id)
        await self.images_repo.delete("group", group_id)

    async def get_player_photo(self, user_id: str, group_id: UUID, group_player_id: UUID) -> Optional[dict]:
        await self._require_member(user_id, await self._require_group(group_id))
        gp = await self.images_repo.get_group_player(group_id, group_player_id)
        if not gp:
            raise NotFoundError("Player", str(group_player_id))
        return await self.images_repo.get("player", gp["player_id"])

    async def get_group_logo(self, user_id: str, group_id: UUID) -> Optional[dict]:
        await self._require_member(user_id, await self._require_group(group_id))
        return await self.images_repo.get("group", group_id)
