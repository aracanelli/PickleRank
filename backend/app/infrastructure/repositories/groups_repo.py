import json
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class GroupsRepository:
    """Repository for group operations."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def create(
        self, owner_user_id: str, name: str, sport: str, settings: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Create a new group."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO groups (owner_user_id, name, sport, settings_json)
            VALUES ($1, $2, $3, $4)
            RETURNING id, owner_user_id, name, sport, settings_json, created_at, updated_at
            """,
            UUID(owner_user_id),
            name,
            sport,
            json.dumps(settings),
        )
        return self._row_to_dict(row)

    async def get_by_id(self, group_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a group by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT id, owner_user_id, name, sport, settings_json, created_at, updated_at, is_archived
            FROM groups
            WHERE id = $1
            """,
            group_id,
        )
        return self._row_to_dict(row) if row else None

    async def list_by_owner(self, owner_user_id: str) -> List[Dict[str, Any]]:
        """List all groups owned by a user."""
        rows = await self.conn.fetch(
            """
            SELECT 
                g.id, g.name, g.sport, g.created_at, g.is_archived,
                COUNT(gp.id) as player_count
            FROM groups g
            LEFT JOIN group_players gp ON gp.group_id = g.id
            WHERE g.owner_user_id = $1 AND g.is_archived = FALSE
            GROUP BY g.id
            ORDER BY g.created_at DESC
            """,
            UUID(owner_user_id),
        )
        return [dict(row) for row in rows]

    async def list_member_groups(self, user_id: str) -> List[Dict[str, Any]]:
        """List groups where the user is a member (via linked player)."""
        rows = await self.conn.fetch(
            """
            SELECT 
                g.id, g.name, g.sport, g.created_at, g.is_archived,
                COUNT(gp2.id) as player_count
            FROM groups g
            JOIN group_players gp ON gp.group_id = g.id
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN group_players gp2 ON gp2.group_id = g.id
            WHERE p.user_id = $1 AND g.is_archived = FALSE
            GROUP BY g.id
            ORDER BY g.created_at DESC
            """,
            UUID(user_id),
        )
        return [dict(row) for row in rows]

    async def archive(self, group_id: UUID) -> Optional[Dict[str, Any]]:
        """Archive a group."""
        row = await self.conn.fetchrow(
            """
            UPDATE groups
            SET is_archived = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING id, owner_user_id, name, sport, settings_json, created_at, updated_at, is_archived
            """,
            group_id,
        )
        return self._row_to_dict(row) if row else None

    async def update_settings(
        self, group_id: UUID, settings: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update group settings."""
        row = await self.conn.fetchrow(
            """
            UPDATE groups
            SET settings_json = $2, updated_at = NOW()
            WHERE id = $1
            RETURNING id, owner_user_id, name, sport, settings_json, created_at, updated_at
            """,
            group_id,
            json.dumps(settings),
        )
        return self._row_to_dict(row) if row else None

    async def delete(self, group_id: UUID) -> bool:
        """Delete a group."""
        result = await self.conn.execute(
            "DELETE FROM groups WHERE id = $1",
            group_id,
        )
        return result == "DELETE 1"

    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return None

        data = dict(row)
        if "settings_json" in data and data["settings_json"]:
            if isinstance(data["settings_json"], str):
                data["settings"] = json.loads(data["settings_json"])
            else:
                data["settings"] = data["settings_json"]
            del data["settings_json"]
        return data




