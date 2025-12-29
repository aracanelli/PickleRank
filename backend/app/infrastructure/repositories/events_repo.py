import json
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class EventsRepository:
    """Repository for event operations."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def create(
        self,
        group_id: UUID,
        name: Optional[str],
        starts_at: Optional[datetime],
        courts: int,
        rounds: int,
    ) -> Dict[str, Any]:
        """Create a new event."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO events (group_id, name, starts_at, courts, rounds)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, group_id, name, starts_at, courts, rounds, status, 
                      generation_meta, created_at, updated_at
            """,
            group_id,
            name,
            starts_at,
            courts,
            rounds,
        )
        return self._row_to_dict(row)
    async def update(self, event_id: UUID, values: Dict[str, Any]) -> None:
        """Update event fields."""        """Update event fields."""
        if not values:
            return

        # Whitelist of allowed columns
        ALLOWED_COLUMNS = {'name', 'starts_at', 'courts', 'rounds'}
        
        # Validate all keys are in whitelist
        invalid_keys = set(values.keys()) - ALLOWED_COLUMNS
        if invalid_keys:
            raise ValueError(f"Invalid columns: {invalid_keys}")
        
        set_clauses = []
        args = [event_id]
        for i, (key, value) in enumerate(values.items()):
            set_clauses.append(f"{key} = ${i + 2}")
            args.append(value)
        
        query = f"""
            UPDATE events
            SET {', '.join(set_clauses)}, updated_at = NOW()
            WHERE id = $1
        """
        await self.conn.execute(query, *args)

    async def get_by_id(self, event_id: UUID) -> Optional[Dict[str, Any]]:        """Get an event by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT e.id, e.group_id, e.name, e.starts_at, e.courts, e.rounds,
                   e.status, e.generation_meta, e.created_at, e.updated_at,
                   g.owner_user_id
            FROM events e
            JOIN groups g ON g.id = e.group_id
            WHERE e.id = $1
            """,
            event_id,
        )
        return self._row_to_dict(row) if row else None

    async def list_by_group(
        self, group_id: UUID, status: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all events in a group."""
        if status:
            rows = await self.conn.fetch(
                """
                SELECT id, group_id, name, starts_at, courts, rounds, status
                FROM events
                WHERE group_id = $1 AND status = $2
                ORDER BY starts_at DESC NULLS LAST, created_at DESC
                """,
                group_id,
                status,
            )
        else:
            rows = await self.conn.fetch(
                """
                SELECT id, group_id, name, starts_at, courts, rounds, status
                FROM events
                WHERE group_id = $1
                ORDER BY starts_at DESC NULLS LAST, created_at DESC
                """,
                group_id,
            )
        return [dict(row) for row in rows]

    async def get_participant_count(self, event_id: UUID) -> int:
        """Get the number of participants in an event."""
        row = await self.conn.fetchrow(
            "SELECT COUNT(*) as count FROM event_participants WHERE event_id = $1",
            event_id,
        )
        return row["count"]

    async def add_participants(
        self, event_id: UUID, group_player_ids: List[UUID]
    ) -> None:
        """Add participants to an event."""
        await self.conn.executemany(
            """
            INSERT INTO event_participants (event_id, group_player_id)
            VALUES ($1, $2)
            ON CONFLICT (event_id, group_player_id) DO NOTHING
            """,
            [(event_id, gp_id) for gp_id in group_player_ids],
        )

    async def get_participants(self, event_id: UUID) -> List[Dict[str, Any]]:
        """Get all participants in an event."""
        rows = await self.conn.fetch(
            """
            SELECT ep.group_player_id, gp.rating, p.display_name
            FROM event_participants ep
            JOIN group_players gp ON gp.id = ep.group_player_id
            JOIN players p ON p.id = gp.player_id
            WHERE ep.event_id = $1
            """,
            event_id,
        )
        return [dict(row) for row in rows]

    async def update_status(
        self, event_id: UUID, status: str, generation_meta: Optional[Dict] = None
    ) -> None:
        """Update event status and optionally generation metadata."""
        if generation_meta is not None:
            await self.conn.execute(
                """
                UPDATE events
                SET status = $2, generation_meta = $3, updated_at = NOW()
                WHERE id = $1
                """,
                event_id,
                status,
                json.dumps(generation_meta),
            )
        else:
            await self.conn.execute(
                """
                UPDATE events
                SET status = $2, updated_at = NOW()
                WHERE id = $1
                """,
                event_id,
                status,
            )

    async def get_previous_event(
        self, group_id: UUID, current_event_id: UUID
    ) -> Optional[Dict[str, Any]]:
        """Get the previous completed event in a group."""
        row = await self.conn.fetchrow(
            """
            SELECT id, group_id, name, starts_at, courts, rounds, status
            FROM events
            WHERE group_id = $1 
              AND status = 'COMPLETED'
              AND id != $2
            ORDER BY starts_at DESC NULLS LAST, created_at DESC
            LIMIT 1
            """,
            group_id,
            current_event_id,
        )
        return dict(row) if row else None

    async def delete(self, event_id: UUID) -> None:
        """Delete an event and all related data (cascade)."""
        await self.conn.execute(
            "DELETE FROM events WHERE id = $1",
            event_id,
        )

    def _row_to_dict(self, row) -> Dict[str, Any]:
        """Convert a database row to a dictionary."""
        if row is None:
            return None

        data = dict(row)
        if "generation_meta" in data and data["generation_meta"]:
            if isinstance(data["generation_meta"], str):
                data["generation_meta"] = json.loads(data["generation_meta"])
        return data







