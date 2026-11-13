from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class GamesRepository:
    """Repository for game operations."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def create_many(self, games: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Create multiple games."""
        if not games:
            return []

        # Build batch insert
        values = []
        for g in games:
            values.append(
                (
                    g["event_id"],
                    g["round_index"],
                    g["court_index"],
                    g["team1_p1"],
                    g["team1_p2"],
                    g["team2_p1"],
                    g["team2_p2"],
                    g.get("team1_elo"),
                    g.get("team2_elo"),
                )
            )

        await self.conn.executemany(
            """
            INSERT INTO games (event_id, round_index, court_index, team1_p1, team1_p2, team2_p1, team2_p2, team1_elo, team2_elo)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            values,
        )

        # Fetch all created games
        return await self.list_by_event(games[0]["event_id"])

    async def get_by_id(self, game_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a game by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT g.id, g.event_id, g.round_index, g.court_index,
                   g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
                   g.score_team1, g.score_team2, g.result, g.swapped,
                   e.group_id
            FROM games g
            JOIN events e ON e.id = g.event_id
            WHERE g.id = $1
            """,
            game_id,
        )
        return dict(row) if row else None

    async def get_score_context(self, game_id: UUID) -> Optional[Dict[str, Any]]:
        """Game id plus its event status, group id and group owner in one round trip."""
        row = await self.conn.fetchrow(
            """
            SELECT g.id, g.event_id, e.status AS event_status, e.group_id, gr.owner_user_id
            FROM games g
            JOIN events e ON e.id = g.event_id
            JOIN groups gr ON gr.id = e.group_id
            WHERE g.id = $1
            """,
            game_id,
        )
        return dict(row) if row else None

    async def list_by_event(self, event_id: UUID) -> List[Dict[str, Any]]:
        """List all games in an event."""
        rows = await self.conn.fetch(
            """
            SELECT g.id, g.event_id, g.round_index, g.court_index,
                   g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
                   g.score_team1, g.score_team2, g.result, g.swapped
            FROM games g
            WHERE g.event_id = $1
            ORDER BY g.round_index, g.court_index
            """,
            event_id,
        )
        return [dict(row) for row in rows]

    async def list_by_event_with_players(
        self, event_id: UUID, game_id: Optional[UUID] = None
    ) -> List[Dict[str, Any]]:
        """List all games in an event with player details, or just one game when game_id is given."""
        args = [event_id] if game_id is None else [event_id, game_id]
        game_filter = "" if game_id is None else "AND g.id = $2"
        rows = await self.conn.fetch(
            f"""
            SELECT g.id, g.event_id, g.round_index, g.court_index,
                   g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
                   g.score_team1, g.score_team2, g.result, g.swapped,
                   g.team1_elo, g.team2_elo, g.score_edited_at,
                   p1.display_name as t1p1_name, gp1.rating as t1p1_rating,
                   p2.display_name as t1p2_name, gp2.rating as t1p2_rating,
                   p3.display_name as t2p1_name, gp3.rating as t2p1_rating,
                   p4.display_name as t2p2_name, gp4.rating as t2p2_rating
            FROM games g
            JOIN group_players gp1 ON gp1.id = g.team1_p1
            JOIN group_players gp2 ON gp2.id = g.team1_p2
            JOIN group_players gp3 ON gp3.id = g.team2_p1
            JOIN group_players gp4 ON gp4.id = g.team2_p2
            JOIN players p1 ON p1.id = gp1.player_id
            JOIN players p2 ON p2.id = gp2.player_id
            JOIN players p3 ON p3.id = gp3.player_id
            JOIN players p4 ON p4.id = gp4.player_id
            WHERE g.event_id = $1 {game_filter}
            ORDER BY g.round_index, g.court_index
            """,
            *args,
        )
        return [dict(row) for row in rows]

    async def list_by_player(self, player_id: UUID) -> List[Dict[str, Any]]:
        """List all games involving a specific player (by group_player_id)."""
        rows = await self.conn.fetch(
            """
            SELECT g.id, g.event_id, g.round_index, g.court_index,
                   g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
                   g.score_team1, g.score_team2, g.result, g.swapped,
                   g.team1_elo, g.team2_elo,
                   p1.display_name as t1p1_name, gp1.rating as t1p1_rating,
                   p2.display_name as t1p2_name, gp2.rating as t1p2_rating,
                   p3.display_name as t2p1_name, gp3.rating as t2p1_rating,
                   p4.display_name as t2p2_name, gp4.rating as t2p2_rating,
                   e.starts_at as event_date
            FROM games g
            JOIN events e ON e.id = g.event_id
            JOIN group_players gp1 ON gp1.id = g.team1_p1
            JOIN group_players gp2 ON gp2.id = g.team1_p2
            JOIN group_players gp3 ON gp3.id = g.team2_p1
            JOIN group_players gp4 ON gp4.id = g.team2_p2
            JOIN players p1 ON p1.id = gp1.player_id
            JOIN players p2 ON p2.id = gp2.player_id
            JOIN players p3 ON p3.id = gp3.player_id
            JOIN players p4 ON p4.id = gp4.player_id
            WHERE g.team1_p1 = $1 OR g.team1_p2 = $1 OR g.team2_p1 = $1 OR g.team2_p2 = $1
            ORDER BY e.starts_at ASC, g.round_index ASC
            """,
            player_id,
        )
        return [dict(row) for row in rows]

    async def update_score(
        self,
        game_id: UUID,
        score_team1: Optional[float],
        score_team2: Optional[float],
        edited_at: Optional[datetime] = None,
        base_edited_at_ms: Optional[int] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update game score.

        With edited_at, last write wins by edit time: returns None (and writes nothing)
        when the stored score was edited later than edited_at, unless base_edited_at_ms equals
        the stored edit (the writer saw the latest score, so its edit is newer whatever its clock).
        The stored edit time only moves forward, so a base never matches twice.
        """
        # Determine result
        if score_team1 is None or score_team2 is None:
            result = "UNSET"
        elif score_team1 > score_team2:
            result = "TEAM1_WIN"
        elif score_team2 > score_team1:
            result = "TEAM2_WIN"
        else:
            result = "TIE"

        row = await self.conn.fetchrow(
            """
            UPDATE games
            SET score_team1 = $2, score_team2 = $3, result = $4, updated_at = NOW(),
                score_edited_at = CASE
                    WHEN $5::timestamptz IS NULL THEN score_edited_at
                    WHEN score_edited_at IS NULL THEN $5::timestamptz
                    ELSE GREATEST($5::timestamptz, score_edited_at + INTERVAL '1 millisecond')
                END
            WHERE id = $1
              AND ($5::timestamptz IS NULL OR score_edited_at IS NULL OR score_edited_at <= $5::timestamptz
                   OR ($6::bigint IS NOT NULL
                       AND FLOOR(EXTRACT(EPOCH FROM score_edited_at) * 1000)::bigint = $6::bigint))
            RETURNING id, event_id, round_index, court_index,
                      team1_p1, team1_p2, team2_p1, team2_p2,
                      score_team1, score_team2, result, swapped
            """,
            game_id,
            score_team1,
            score_team2,
            result,
            edited_at,
            base_edited_at_ms,
        )
        return dict(row) if row else None

    async def swap_players(
        self, game_id: UUID, position1: str, position2: str, player1_id: UUID, player2_id: UUID
    ) -> None:
        """Swap players in a game."""
        # This is a complex operation - we need to swap the player IDs in the correct positions
        await self.conn.execute(
            f"""
            UPDATE games
            SET {position1} = $2, {position2} = $3, swapped = TRUE, updated_at = NOW()
            WHERE id = $1
            """,
            game_id,
            player2_id,
            player1_id,
        )

    async def has_scored_games(self, event_id: UUID) -> bool:
        """True if any game in the event has a result."""
        return await self.conn.fetchval(
            "SELECT EXISTS (SELECT 1 FROM games WHERE event_id = $1 AND result <> 'UNSET')",
            event_id,
        )

    async def delete_by_event(self, event_id: UUID) -> None:
        """Delete all games for an event."""
        await self.conn.execute(
            "DELETE FROM games WHERE event_id = $1",
            event_id,
        )

    async def delete(self, game_id: UUID) -> None:
        """Delete a single game by ID."""
        await self.conn.execute(
            "DELETE FROM games WHERE id = $1",
            game_id,
        )

    async def update_players(
        self, game_id: UUID, team1_p1: UUID, team1_p2: UUID, team2_p1: UUID, team2_p2: UUID
    ) -> Dict[str, Any]:
        """Update all player positions in a game."""
        row = await self.conn.fetchrow(
            """
            UPDATE games
            SET team1_p1 = $2, team1_p2 = $3, team2_p1 = $4, team2_p2 = $5, 
                swapped = TRUE, updated_at = NOW()
            WHERE id = $1
            RETURNING id, event_id, round_index, court_index,
                      team1_p1, team1_p2, team2_p1, team2_p2,
                      score_team1, score_team2, result, swapped
            """,
            game_id,
            team1_p1,
            team1_p2,
            team2_p1,
            team2_p2,
        )
        return dict(row) if row else None

    async def get_teammate_pairs_from_event(self, event_id: UUID) -> List[tuple]:
        """Get all teammate pairs from an event."""
        rows = await self.conn.fetch(
            """
            SELECT DISTINCT
                LEAST(team1_p1, team1_p2) as p1,
                GREATEST(team1_p1, team1_p2) as p2
            FROM games
            WHERE event_id = $1
            UNION
            SELECT DISTINCT
                LEAST(team2_p1, team2_p2) as p1,
                GREATEST(team2_p1, team2_p2) as p2
            FROM games
            WHERE event_id = $1
            """,
            event_id,
        )
        return [(row["p1"], row["p2"]) for row in rows]



