"""Repository for the Awards feature (editions, categories, votes)."""
import json
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class AwardsRepository:
    """Raw asyncpg repository for award editions, categories and votes."""

    def __init__(self, conn: Connection):
        self.conn = conn

    def _edition_row_to_dict(self, row) -> Optional[Dict[str, Any]]:
        """Convert an award_editions row to a dict, decoding the stat_awards JSONB."""
        if row is None:
            return None
        data = dict(row)
        if "stat_awards" in data and data["stat_awards"] is not None:
            if isinstance(data["stat_awards"], str):
                data["stat_awards"] = json.loads(data["stat_awards"])
        else:
            data["stat_awards"] = []
        return data

    # ------------------------------------------------------------------
    # Editions
    # ------------------------------------------------------------------

    async def get_latest_edition(self, group_id: UUID) -> Optional[Dict[str, Any]]:
        """Return the most recently created edition for a group, or None."""
        row = await self.conn.fetchrow(
            """
            SELECT id, group_id, title, status, stat_awards, created_at, updated_at
            FROM award_editions
            WHERE group_id = $1
            ORDER BY created_at DESC
            LIMIT 1
            """,
            group_id,
        )
        return self._edition_row_to_dict(row)

    async def create_edition(
        self, group_id: UUID, title: str, stat_awards: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Create a DRAFT edition, persisting stat_awards as JSONB verbatim."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO award_editions (group_id, title, stat_awards)
            VALUES ($1, $2, $3::jsonb)
            RETURNING id, group_id, title, status, stat_awards, created_at, updated_at
            """,
            group_id,
            title,
            json.dumps(stat_awards or []),
        )
        return self._edition_row_to_dict(row)

    async def update_edition(
        self,
        edition_id: UUID,
        title: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update an edition's title and/or status."""
        updates = []
        params: List[Any] = [edition_id]
        idx = 2
        if title is not None:
            updates.append(f"title = ${idx}")
            params.append(title)
            idx += 1
        if status is not None:
            updates.append(f"status = ${idx}")
            params.append(status)
            idx += 1

        if not updates:
            return await self.get_edition(edition_id)

        query = f"""
            UPDATE award_editions
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, group_id, title, status, stat_awards, created_at, updated_at
        """
        row = await self.conn.fetchrow(query, *params)
        return self._edition_row_to_dict(row)

    async def get_edition(self, edition_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a single edition by id."""
        row = await self.conn.fetchrow(
            """
            SELECT id, group_id, title, status, stat_awards, created_at, updated_at
            FROM award_editions
            WHERE id = $1
            """,
            edition_id,
        )
        return self._edition_row_to_dict(row)

    async def delete_edition(self, edition_id: UUID) -> bool:
        """Delete an edition (categories + votes cascade)."""
        result = await self.conn.execute(
            "DELETE FROM award_editions WHERE id = $1",
            edition_id,
        )
        return result == "DELETE 1"

    # ------------------------------------------------------------------
    # Categories
    # ------------------------------------------------------------------

    async def add_category(
        self, edition_id: UUID, title: str, description: Optional[str] = None
    ) -> Dict[str, Any]:
        """Add a voting category to an edition."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO award_categories (edition_id, title, description)
            VALUES ($1, $2, $3)
            RETURNING id, edition_id, title, description, created_at
            """,
            edition_id,
            title,
            description,
        )
        return dict(row) if row else None

    async def list_categories(self, edition_id: UUID) -> List[Dict[str, Any]]:
        """List all categories for an edition, oldest first."""
        rows = await self.conn.fetch(
            """
            SELECT id, edition_id, title, description, created_at
            FROM award_categories
            WHERE edition_id = $1
            ORDER BY created_at ASC
            """,
            edition_id,
        )
        return [dict(row) for row in rows]

    async def get_category(self, category_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a category joined to its edition's group_id and status."""
        row = await self.conn.fetchrow(
            """
            SELECT c.id, c.edition_id, c.title, c.description, c.created_at,
                   e.group_id, e.status AS edition_status
            FROM award_categories c
            JOIN award_editions e ON e.id = c.edition_id
            WHERE c.id = $1
            """,
            category_id,
        )
        return dict(row) if row else None

    async def delete_category(self, category_id: UUID) -> bool:
        """Delete a category (votes cascade)."""
        result = await self.conn.execute(
            "DELETE FROM award_categories WHERE id = $1",
            category_id,
        )
        return result == "DELETE 1"

    # ------------------------------------------------------------------
    # Votes
    # ------------------------------------------------------------------

    async def upsert_vote(
        self, category_id: UUID, voter_gp_id: UUID, nominee_gp_id: UUID
    ) -> Dict[str, Any]:
        """Upsert a voter's pick for a category (one vote per voter per category)."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO award_votes (category_id, voter_group_player_id, nominee_group_player_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (category_id, voter_group_player_id)
            DO UPDATE SET nominee_group_player_id = EXCLUDED.nominee_group_player_id,
                          updated_at = NOW()
            RETURNING id, category_id, voter_group_player_id, nominee_group_player_id
            """,
            category_id,
            voter_gp_id,
            nominee_gp_id,
        )
        return dict(row) if row else None

    async def get_my_votes(
        self, edition_id: UUID, voter_gp_id: UUID
    ) -> Dict[UUID, UUID]:
        """Return {category_id: nominee_group_player_id} for a voter across an edition."""
        rows = await self.conn.fetch(
            """
            SELECT v.category_id, v.nominee_group_player_id
            FROM award_votes v
            JOIN award_categories c ON c.id = v.category_id
            WHERE c.edition_id = $1 AND v.voter_group_player_id = $2
            """,
            edition_id,
            voter_gp_id,
        )
        return {row["category_id"]: row["nominee_group_player_id"] for row in rows}

    async def get_results(self, edition_id: UUID) -> Dict[UUID, List[Dict[str, Any]]]:
        """Per-category tallies joined to nominee display_name, sorted votes desc."""
        rows = await self.conn.fetch(
            """
            SELECT v.category_id,
                   v.nominee_group_player_id,
                   p.display_name,
                   COUNT(*) AS votes
            FROM award_votes v
            JOIN award_categories c ON c.id = v.category_id
            JOIN group_players gp ON gp.id = v.nominee_group_player_id
            JOIN players p ON p.id = gp.player_id
            WHERE c.edition_id = $1
            GROUP BY v.category_id, v.nominee_group_player_id, p.display_name
            ORDER BY votes DESC, p.display_name ASC
            """,
            edition_id,
        )
        results: Dict[UUID, List[Dict[str, Any]]] = {}
        for row in rows:
            results.setdefault(row["category_id"], []).append(
                {
                    "nominee_group_player_id": row["nominee_group_player_id"],
                    "display_name": row["display_name"],
                    "votes": int(row["votes"]),
                }
            )
        return results

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    async def resolve_group_player_id(
        self, user_id: str, group_id: UUID
    ) -> Optional[UUID]:
        """Resolve the caller's group_player id in a group from their user id."""
        return await self.conn.fetchval(
            """
            SELECT gp.id
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.group_id = $1 AND p.user_id = $2
            LIMIT 1
            """,
            group_id,
            UUID(user_id),
        )

    async def nominee_in_group(self, gp_id: UUID, group_id: UUID) -> bool:
        """Check that a nominee group_player belongs to the group."""
        val = await self.conn.fetchval(
            "SELECT 1 FROM group_players WHERE id = $1 AND group_id = $2 LIMIT 1",
            gp_id,
            group_id,
        )
        return val is not None
