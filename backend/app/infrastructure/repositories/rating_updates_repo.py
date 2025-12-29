from typing import Any, Dict, List
from uuid import UUID

from asyncpg import Connection


class RatingUpdatesRepository:
    """Repository for rating update audit trail."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def create(
        self,
        event_id: UUID,
        group_player_id: UUID,
        rating_before: float,
        rating_after: float,
        delta: float,
        system: str,
    ) -> Dict[str, Any]:
        """Create a rating update record."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO rating_updates (event_id, group_player_id, rating_before, rating_after, delta, system)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, event_id, group_player_id, rating_before, rating_after, delta, system, created_at
            """,
            event_id,
            group_player_id,
            rating_before,
            rating_after,
            delta,
            system,
        )
        return dict(row)

    async def create_many(self, updates: List[Dict[str, Any]]) -> None:
        """Create multiple rating update records."""
        if not updates:
            return

        await self.conn.executemany(
            """
            INSERT INTO rating_updates (event_id, group_player_id, rating_before, rating_after, delta, system)
            VALUES ($1, $2, $3, $4, $5, $6)
            """,
            [
                (
                    u["event_id"],
                    u["group_player_id"],
                    u["rating_before"],
                    u["rating_after"],
                    u["delta"],
                    u["system"],
                )
                for u in updates
            ],
        )

    async def list_by_event(self, event_id: UUID) -> List[Dict[str, Any]]:
        """List all rating updates for an event."""
        rows = await self.conn.fetch(
            """
            SELECT ru.id, ru.event_id, ru.group_player_id, 
                   ru.rating_before, ru.rating_after, ru.delta, ru.system,
                   p.display_name
            FROM rating_updates ru
            JOIN group_players gp ON gp.id = ru.group_player_id
            JOIN players p ON p.id = gp.player_id
            WHERE ru.event_id = $1
            ORDER BY ru.delta DESC
            """,
            event_id,
        )
        return [dict(row) for row in rows]

    async def get_last_event_deltas(self, group_id: UUID) -> Dict[UUID, float]:
        """
        Get rating_before values from the most recent completed event for a group.
        Returns a dict of group_player_id -> rating_before.
        The actual delta will be calculated as current_rating - rating_before.
        """
        rows = await self.conn.fetch(
            """
            SELECT ru.group_player_id, ru.rating_before
            FROM rating_updates ru
            JOIN events e ON e.id = ru.event_id
            JOIN group_players gp ON gp.id = ru.group_player_id AND gp.group_id = $1
            WHERE e.group_id = $1 AND e.status = 'COMPLETED'
            AND e.id = (
                SELECT id FROM events 
                WHERE group_id = $1 AND status = 'COMPLETED'
                ORDER BY starts_at DESC, created_at DESC
                LIMIT 1
            )
            """,
            group_id,
        )
        return {row["group_player_id"]: float(row["rating_before"]) for row in rows}



    async def get_history_by_group_player(self, group_player_id: UUID) -> List[Dict[str, Any]]:
        """Get rating history for a group player.
        
        Uses event starts_at date for the chart x-axis (falls back to ru.created_at if null).
        """
        rows = await self.conn.fetch(
            """
            SELECT ru.rating_after as rating, 
                   COALESCE(e.starts_at, ru.created_at) as created_at,
                   e.name as event_name, 
                   ru.event_id, 
                   ru.delta, 
                   ru.rating_before
            FROM rating_updates ru
            LEFT JOIN events e ON e.id = ru.event_id
            WHERE ru.group_player_id = $1
            ORDER BY COALESCE(e.starts_at, ru.created_at) ASC
            """,
            group_player_id,
        )
        return [dict(row) for row in rows]



