"""
Images repository - player photos and league logos stored as re-encoded bytes.
"""
from typing import Any, Dict, Optional
from uuid import UUID

from asyncpg import Connection


def version_of(updated_at) -> Optional[int]:
    """Cache-busting version for a stored image (ms since epoch), or None when there is none."""
    return int(updated_at.timestamp() * 1000) if updated_at else None


class ImagesRepository:
    """Data access for the images table. One row per (kind, ref_id)."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def get(self, kind: str, ref_id: UUID) -> Optional[Dict[str, Any]]:
        row = await self.conn.fetchrow(
            "SELECT mime, data, updated_at FROM images WHERE kind = $1 AND ref_id = $2",
            kind,
            ref_id,
        )
        return dict(row) if row else None

    async def upsert(
        self, kind: str, ref_id: UUID, mime: str, data: bytes, width: int, height: int
    ) -> int:
        updated_at = await self.conn.fetchval(
            """
            INSERT INTO images (kind, ref_id, mime, data, width, height, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, NOW())
            ON CONFLICT (kind, ref_id) DO UPDATE
               SET mime = EXCLUDED.mime, data = EXCLUDED.data, width = EXCLUDED.width,
                   height = EXCLUDED.height, updated_at = NOW()
            RETURNING updated_at
            """,
            kind,
            ref_id,
            mime,
            data,
            width,
            height,
        )
        return version_of(updated_at)

    async def delete(self, kind: str, ref_id: UUID) -> None:
        await self.conn.execute(
            "DELETE FROM images WHERE kind = $1 AND ref_id = $2", kind, ref_id
        )

    async def get_group_player(self, group_id: UUID, group_player_id: UUID) -> Optional[Dict[str, Any]]:
        """The membership row plus the internal user id it is linked to (None when unlinked)."""
        row = await self.conn.fetchrow(
            """
            SELECT gp.id, p.user_id
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.id = $1 AND gp.group_id = $2
            """,
            group_player_id,
            group_id,
        )
        return dict(row) if row else None
