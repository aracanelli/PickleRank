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



