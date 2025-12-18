from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class PlayersRepository:
    """Repository for player operations."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def create(
        self, owner_user_id: str, display_name: str, notes: Optional[str] = None, user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Create a new global player."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO players (owner_user_id, display_name, notes, user_id)
            VALUES ($1, $2, $3, $4)
            RETURNING id, display_name, notes, user_id, invite_token, created_at, updated_at
            """,
            UUID(owner_user_id),
            display_name,
            notes,
            UUID(user_id) if user_id else None,
        )
        return dict(row)

    async def get_by_id(self, player_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a player by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT id, owner_user_id, display_name, notes, user_id, invite_token, created_at, updated_at
            FROM players
            WHERE id = $1
            """,
            player_id,
        )
        return dict(row) if row else None

    async def list_by_owner(
        self, owner_user_id: str, search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """List all players owned by a user."""
        if search:
            rows = await self.conn.fetch(
                """
                SELECT id, display_name, notes, user_id, invite_token, created_at
                FROM players
                WHERE owner_user_id = $1 AND display_name ILIKE $2
                ORDER BY display_name
                """,
                UUID(owner_user_id),
                f"%{search}%",
            )
        else:
            rows = await self.conn.fetch(
                """
                SELECT id, display_name, notes, user_id, invite_token, created_at
                FROM players
                WHERE owner_user_id = $1
                ORDER BY display_name
                """,
                UUID(owner_user_id),
            )
        return [dict(row) for row in rows]

    async def list_by_linked_user(self, user_id: str) -> List[Dict[str, Any]]:
        """List players linked to a user."""
        rows = await self.conn.fetch(
            """
            SELECT id, owner_user_id, display_name, notes, user_id, invite_token, created_at
            FROM players
            WHERE user_id = $1
            """,
            UUID(user_id),
        )
        return [dict(row) for row in rows]

    async def update(
        self,
        player_id: UUID,
        display_name: Optional[str] = None,
        notes: Optional[str] = None,
        user_id: Optional[str] = None,
        invite_token: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a player."""
        # Build dynamic update
        updates = []
        params = [player_id]
        param_idx = 2

        if display_name is not None:
            updates.append(f"display_name = ${param_idx}")
            params.append(display_name)
            param_idx += 1

        if notes is not None:
            updates.append(f"notes = ${param_idx}")
            params.append(notes)
            param_idx += 1

        if user_id is not None:
            updates.append(f"user_id = ${param_idx}")
            params.append(UUID(user_id))
            param_idx += 1

        if invite_token is not None:
            updates.append(f"invite_token = ${param_idx}")
            params.append(invite_token)
            param_idx += 1

        if not updates:
            return await self.get_by_id(player_id)

        query = f"""
            UPDATE players
            SET {', '.join(updates)}, updated_at = NOW()
            WHERE id = $1
            RETURNING id, display_name, notes, user_id, invite_token, created_at, updated_at
        """

        row = await self.conn.fetchrow(query, *params)
        return dict(row) if row else None

    async def get_by_invite_token(self, token: str) -> Optional[Dict[str, Any]]:
        """Get a player by invite token."""
        row = await self.conn.fetchrow(
            """
            SELECT id, owner_user_id, display_name, notes, user_id, invite_token, created_at, updated_at
            FROM players
            WHERE invite_token = $1
            """,
            token,
        )
        return dict(row) if row else None

    async def delete(self, player_id: UUID) -> bool:
        """Delete a player."""
        result = await self.conn.execute(
            "DELETE FROM players WHERE id = $1",
            player_id,
        )
        return result == "DELETE 1"

    async def create_bulk(
        self, owner_user_id: str, names: List[str]
    ) -> tuple[List[Dict[str, Any]], List[str]]:
        """
        Create multiple players at once.
        Returns (created_players, skipped_names) where skipped_names are duplicates.
        """
        created = []
        skipped = []
        owner_uuid = UUID(owner_user_id)

        # Get existing player names for this owner to check for duplicates
        existing = await self.conn.fetch(
            """
            SELECT LOWER(display_name) as name
            FROM players
            WHERE owner_user_id = $1
            """,
            owner_uuid,
        )
        existing_names = {row["name"] for row in existing}

        for name in names:
            name = name.strip()
            if not name:
                continue

            # Check for duplicate (case-insensitive)
            if name.lower() in existing_names:
                skipped.append(name)
                continue

            # Create the player
            row = await self.conn.fetchrow(
                """
                INSERT INTO players (owner_user_id, display_name)
                VALUES ($1, $2)
                RETURNING id, display_name, notes, created_at, updated_at
                """,
                owner_uuid,
                name,
            )
            created.append(dict(row))
            existing_names.add(name.lower())

        return created, skipped


class GroupPlayersRepository:
    """Repository for group player (membership) operations."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def add_player_to_group(
        self,
        group_id: UUID,
        player_id: UUID,
        initial_rating: float,
        membership_type: str = "PERMANENT",
        skill_level: Optional[str] = None,
        role: str = "PLAYER",
    ) -> Dict[str, Any]:
        """Add a player to a group with optional skill level for subs."""
        row = await self.conn.fetchrow(
            """
            INSERT INTO group_players (group_id, player_id, rating, membership_type, skill_level, role)
            VALUES ($1, $2, $3, $4::membership_type, $5, $6)
            ON CONFLICT (group_id, player_id) DO NOTHING
            RETURNING id, group_id, player_id, membership_type, skill_level, role, rating, games_played, wins, losses, ties, created_at
            """,
            group_id,
            player_id,
            initial_rating,
            membership_type,
            skill_level,
            role,
        )
        if row is None:
            # Already exists, fetch it
            row = await self.conn.fetchrow(
                """
                SELECT id, group_id, player_id, membership_type, skill_level, role, rating, games_played, wins, losses, ties, created_at
                FROM group_players
                WHERE group_id = $1 AND player_id = $2
                """,
                group_id,
                player_id,
            )
        return dict(row)

    async def bulk_add_players_to_group(
        self,
        group_id: UUID,
        players: List[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], List[str]]:
        """
        Add multiple players to a group at once.
        Each player dict should have: player_id, membership_type, initial_rating, skill_level
        Returns (added_players, skipped_player_ids) where skipped are already in the group.
        """
        added = []
        skipped = []

        # Get existing player_ids in this group
        existing = await self.conn.fetch(
            """
            SELECT player_id FROM group_players WHERE group_id = $1
            """,
            group_id,
        )
        existing_player_ids = {row["player_id"] for row in existing}

        for player_data in players:
            player_id = player_data["player_id"]
            membership_type = player_data.get("membership_type", "PERMANENT")
            initial_rating = player_data.get("initial_rating", 1000)
            skill_level = player_data.get("skill_level")  # None for permanent players

            role = player_data.get("role", "PLAYER")

            if player_id in existing_player_ids:
                skipped.append(str(player_id))
                continue

            row = await self.conn.fetchrow(
                """
                INSERT INTO group_players (group_id, player_id, rating, membership_type, skill_level, role)
                VALUES ($1, $2, $3, $4::membership_type, $5, $6)
                RETURNING id, group_id, player_id, membership_type, skill_level, role, rating, games_played, wins, losses, ties, created_at
                """,
                group_id,
                player_id,
                initial_rating,
                membership_type,
                skill_level,
                role,
            )
            added.append(dict(row))
            existing_player_ids.add(player_id)

        return added, skipped

    async def update_group_player(
        self,
        group_player_id: UUID,
        membership_type: Optional[str] = None,
        skill_level: Optional[str] = None,
        role: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Update a group player's membership type, skill level, and role."""
        # Build dynamic update
        updates = []
        params = [group_player_id]
        param_idx = 2
        
        if membership_type is not None:
            updates.append(f"membership_type = ${param_idx}::membership_type")
            params.append(membership_type)
            param_idx += 1
        
        # skill_level can be set to None to clear it, so we use a special marker
        if skill_level is not None:
            updates.append(f"skill_level = ${param_idx}")
            params.append(skill_level if skill_level != "__CLEAR__" else None)
            param_idx += 1
        
        if role is not None:
            updates.append(f"role = ${param_idx}")
            params.append(role)
            param_idx += 1
        
        if not updates:
            return await self.get_by_id(group_player_id)
        
        updates.append("updated_at = NOW()")
        query = f"""
            UPDATE group_players
            SET {', '.join(updates)}
            WHERE id = $1
            RETURNING id, group_id, player_id, membership_type, skill_level, role, rating, games_played, wins, losses, ties, created_at, updated_at
        """
        row = await self.conn.fetchrow(query, *params)
        return dict(row) if row else None


    async def get_by_id(self, group_player_id: UUID) -> Optional[Dict[str, Any]]:
        """Get a group player by ID."""
        row = await self.conn.fetchrow(
            """
            SELECT gp.id, gp.group_id, gp.player_id, gp.membership_type, gp.skill_level, gp.role, gp.rating, 
                   gp.games_played, gp.wins, gp.losses, gp.ties,
                   p.display_name, u.clerk_user_id as user_id, gp.created_at, gp.updated_at,
                   CASE WHEN gp.games_played > 0 
                        THEN ROUND((gp.wins + 0.5 * gp.ties)::NUMERIC / gp.games_played, 3)
                        ELSE 0 
                   END AS win_rate
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE gp.id = $1
            """,
            group_player_id,
        )
        return dict(row) if row else None

    async def list_by_group(self, group_id: UUID) -> List[Dict[str, Any]]:
        """List all players in a group."""
        rows = await self.conn.fetch(
            """
            SELECT gp.id, gp.group_id, gp.player_id, gp.membership_type, gp.skill_level, gp.role, gp.rating,
                   gp.games_played, gp.wins, gp.losses, gp.ties,
                   p.display_name, u.clerk_user_id as user_id,
                   CASE WHEN gp.games_played > 0 
                        THEN ROUND((gp.wins + 0.5 * gp.ties)::NUMERIC / gp.games_played, 3)
                        ELSE 0 
                   END AS win_rate
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE gp.group_id = $1
            ORDER BY gp.rating DESC
            """,
            group_id,
        )
        return [dict(row) for row in rows]

    async def get_by_ids(self, group_player_ids: List[UUID]) -> List[Dict[str, Any]]:
        """Get multiple group players by IDs."""
        rows = await self.conn.fetch(
            """
            SELECT gp.id, gp.group_id, gp.player_id, gp.membership_type, gp.skill_level, gp.role, gp.rating,
                   gp.games_played, gp.wins, gp.losses, gp.ties,
                   p.display_name, u.clerk_user_id as user_id
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN users u ON u.id = p.user_id
            WHERE gp.id = ANY($1)
            """,
            group_player_ids,
        )
        return [dict(row) for row in rows]

    async def update_rating(
        self,
        group_player_id: UUID,
        rating: float,
        games_delta: int = 0,
        wins_delta: int = 0,
        losses_delta: int = 0,
        ties_delta: int = 0,
    ) -> None:
        """Update a player's rating and stats."""
        await self.conn.execute(
            """
            UPDATE group_players
            SET rating = $2,
                games_played = games_played + $3,
                wins = wins + $4,
                losses = losses + $5,
                ties = ties + $6,
                updated_at = NOW()
            WHERE id = $1
            """,
            group_player_id,
            rating,
            games_delta,
            wins_delta,
            losses_delta,
            ties_delta,
        )

    async def set_rating(
        self,
        group_player_id: UUID,
        rating: float,
    ) -> None:
        """Set a player's rating (without affecting stats)."""
        await self.conn.execute(
            """
            UPDATE group_players
            SET rating = $2, updated_at = NOW()
            WHERE id = $1
            """,
            group_player_id,
            rating,
        )

    async def remove_from_group(self, group_id: UUID, group_player_id: UUID) -> bool:
        """Remove a player from a group."""
        result = await self.conn.execute(
            "DELETE FROM group_players WHERE id = $1 AND group_id = $2",
            group_player_id,
            group_id,
        )
        return result == "DELETE 1"

    async def is_member(self, user_id: str, group_id: UUID) -> bool:
        """Check if a user is a member of a group."""
        val = await self.conn.fetchval(
            """
            SELECT 1 
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.group_id = $1 AND p.user_id = $2
            LIMIT 1
            """,
            group_id,
            UUID(user_id)
        )
        return val is not None

    async def is_organizer(self, user_id: str, group_id: UUID) -> bool:
        """Check if a user is an organizer in a group (has ORGANIZER role)."""
        val = await self.conn.fetchval(
            """
            SELECT 1 
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.group_id = $1 AND p.user_id = $2 AND gp.role = 'ORGANIZER'
            LIMIT 1
            """,
            group_id,
            UUID(user_id)
        )
        return val is not None




