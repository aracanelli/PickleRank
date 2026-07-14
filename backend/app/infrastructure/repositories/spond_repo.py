"""Repository for Spond integration tables."""

from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class SpondRepository:
    """Data access for spond_accounts, spond_group_links and spond_member_links."""

    def __init__(self, conn: Connection):
        self.conn = conn

    # ----- accounts (per user) -----

    async def upsert_account(
        self,
        user_id: str,
        spond_email: str,
        encrypted_credentials: str,
        access_token: Optional[str] = None,
        token_expires_at: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        row = await self.conn.fetchrow(
            """
            INSERT INTO spond_accounts
                (user_id, spond_email, encrypted_credentials, access_token, token_expires_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id) DO UPDATE SET
                spond_email = EXCLUDED.spond_email,
                encrypted_credentials = EXCLUDED.encrypted_credentials,
                access_token = EXCLUDED.access_token,
                token_expires_at = EXCLUDED.token_expires_at,
                updated_at = NOW()
            RETURNING id, user_id, spond_email, encrypted_credentials,
                      access_token, token_expires_at, created_at, updated_at
            """,
            UUID(user_id),
            spond_email,
            encrypted_credentials,
            access_token,
            token_expires_at,
        )
        return dict(row)

    async def get_account(self, user_id: str) -> Optional[Dict[str, Any]]:
        row = await self.conn.fetchrow(
            """
            SELECT id, user_id, spond_email, encrypted_credentials,
                   access_token, token_expires_at, created_at, updated_at
            FROM spond_accounts
            WHERE user_id = $1
            """,
            UUID(user_id),
        )
        return dict(row) if row else None

    async def update_cached_token(
        self, user_id: str, access_token: str, token_expires_at: Optional[datetime]
    ) -> None:
        await self.conn.execute(
            """
            UPDATE spond_accounts
            SET access_token = $2, token_expires_at = $3, updated_at = NOW()
            WHERE user_id = $1
            """,
            UUID(user_id),
            access_token,
            token_expires_at,
        )

    async def delete_account(self, user_id: str) -> bool:
        result = await self.conn.execute(
            "DELETE FROM spond_accounts WHERE user_id = $1",
            UUID(user_id),
        )
        return result == "DELETE 1"

    # ----- group links (PickleRank group <-> Spond group) -----

    async def upsert_group_link(
        self,
        group_id: UUID,
        spond_group_id: str,
        spond_group_name: Optional[str],
        linked_by_user_id: str,
    ) -> Dict[str, Any]:
        row = await self.conn.fetchrow(
            """
            INSERT INTO spond_group_links
                (group_id, spond_group_id, spond_group_name, linked_by_user_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (group_id) DO UPDATE SET
                spond_group_id = EXCLUDED.spond_group_id,
                spond_group_name = EXCLUDED.spond_group_name,
                linked_by_user_id = EXCLUDED.linked_by_user_id
            RETURNING id, group_id, spond_group_id, spond_group_name, linked_by_user_id, created_at
            """,
            group_id,
            spond_group_id,
            spond_group_name,
            UUID(linked_by_user_id),
        )
        return dict(row)

    async def get_group_link(self, group_id: UUID) -> Optional[Dict[str, Any]]:
        row = await self.conn.fetchrow(
            """
            SELECT id, group_id, spond_group_id, spond_group_name, linked_by_user_id, created_at
            FROM spond_group_links
            WHERE group_id = $1
            """,
            group_id,
        )
        return dict(row) if row else None

    # ----- member links (Spond attendee -> PickleRank player) -----

    async def get_member_links(self, group_id: UUID) -> List[Dict[str, Any]]:
        rows = await self.conn.fetch(
            """
            SELECT id, group_id, spond_member_id, player_id, created_at
            FROM spond_member_links
            WHERE group_id = $1
            """,
            group_id,
        )
        return [dict(row) for row in rows]

    async def upsert_member_link(
        self, group_id: UUID, spond_member_id: str, player_id: UUID
    ) -> Dict[str, Any]:
        row = await self.conn.fetchrow(
            """
            INSERT INTO spond_member_links (group_id, spond_member_id, player_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (group_id, spond_member_id) DO UPDATE SET
                player_id = EXCLUDED.player_id
            RETURNING id, group_id, spond_member_id, player_id, created_at
            """,
            group_id,
            spond_member_id,
            player_id,
        )
        return dict(row)
