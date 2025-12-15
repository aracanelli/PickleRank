"""
Group service - handles group-related use cases.
"""
import json
from typing import Any, Dict, List
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.groups import (
    GroupCreate,
    GroupListItem,
    GroupResponse,
    GroupSettings,
    GroupSettingsUpdate,
)
from app.exceptions import ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository


class GroupService:
    """Service for group operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.groups_repo = GroupsRepository(conn)

    async def create_group(self, user_id: str, data: GroupCreate) -> GroupResponse:
        """Create a new group."""
        # Prepare settings
        settings = data.settings or GroupSettings()
        settings_dict = settings.model_dump(by_alias=True)

        # Create group
        group = await self.groups_repo.create(
            owner_user_id=user_id,
            name=data.name,
            sport=data.sport,
            settings=settings_dict,
        )

        return self._to_response(group)

    async def list_groups(self, user_id: str) -> List[GroupListItem]:
        """List all groups owned by a user."""
        groups = await self.groups_repo.list_by_owner(user_id)
        return [
            GroupListItem(
                id=g["id"],
                name=g["name"],
                sport=g["sport"],
                playerCount=g["player_count"],
                created_at=g["created_at"],
                is_archived=g.get("is_archived", False),
            )
            for g in groups
        ]

    async def list_member_groups(self, user_id: str) -> List[GroupListItem]:
        """List all groups where user is a member."""
        groups = await self.groups_repo.list_member_groups(user_id)
        return [
            GroupListItem(
                id=g["id"],
                name=g["name"],
                sport=g["sport"],
                playerCount=g["player_count"],
                created_at=g["created_at"],
                is_archived=g.get("is_archived", False),
            )
            for g in groups
        ]

    async def get_group(self, user_id: str, group_id: UUID) -> GroupResponse:
        """Get a specific group."""
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        return self._to_response(group)

    async def update_settings(
        self, user_id: str, group_id: UUID, data: GroupSettingsUpdate
    ) -> GroupResponse:
        """Update group settings."""
        # Get current group
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Merge settings
        current_settings = group["settings"]
        updates = data.model_dump(by_alias=True, exclude_unset=True)

        for key, value in updates.items():
            if value is not None:
                current_settings[key] = value

        # Update
        updated = await self.groups_repo.update_settings(group_id, current_settings)

        return self._to_response(updated)

    async def update_group(
        self, user_id: str, group_id: UUID, name: str
    ) -> GroupResponse:
        """Update group name."""
        # Get current group
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Update name
        await self.conn.execute(
            """
            UPDATE groups SET name = $1, updated_at = NOW() WHERE id = $2
            """,
            name,
            group_id
        )

        updated = await self.groups_repo.get_by_id(group_id)
        return self._to_response(updated)

    async def recalculate_ratings(self, user_id: str, group_id: UUID) -> Dict[str, Any]:
        """
        Recalculate all player ratings from scratch.
        
        1. Reset all player ratings to initial rating
        2. Get all completed events in chronological order  
        3. Recalculate ratings for each event
        
        Returns summary of changes.
        """
        from app.domain.ratings.base import GameForRating, PlayerRating, GameResult as DomainGameResult
        from app.domain.ratings.factory import create_rating_system
        from app.infrastructure.repositories.players_repo import GroupPlayersRepository
        
        # Verify ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")
        
        settings = group["settings"]
        base_rating = settings.get("initialRating", 1000)
        
        # Get all players to calculate initial ratings based on skill level
        all_players = await self.conn.fetch(
            """
            SELECT id, skill_level FROM group_players WHERE group_id = $1
            """,
            group_id
        )
        
        # Build initial ratings dictionary based on skill level
        current_ratings = {}
        for player in all_players:
            player_skill = player.get("skill_level")
            initial_rating = base_rating
            
            # Calculate initial rating based on skill level
            if player_skill:
                offset_multiplier = base_rating / 1000
                if player_skill == "ADVANCED":
                    initial_rating = base_rating + int(100 * offset_multiplier)
                elif player_skill == "BEGINNER":
                    initial_rating = base_rating - int(100 * offset_multiplier)
                # INTERMEDIATE stays at base_rating
            
            current_ratings[player["id"]] = initial_rating
        
        # Reset all player stats in DB
        await self.conn.execute(
            """
            UPDATE group_players 
            SET wins = 0, losses = 0, ties = 0, games_played = 0
            WHERE group_id = $1
            """,
            group_id
        )
        
        # Get all completed events in chronological order
        completed_events = await self.conn.fetch(
            """
            SELECT id, name, starts_at FROM events 
            WHERE group_id = $1 AND status = 'COMPLETED'
            ORDER BY starts_at ASC, created_at ASC
            """,
            group_id
        )
        
        # Create rating system
        rating_system = create_rating_system(
            settings.get("ratingSystem", "SERIOUS_ELO"),
            k_factor=settings.get("kFactor", 32),
            elo_const=settings.get("eloConst"),
        )
        
        group_players_repo = GroupPlayersRepository(self.conn)
        events_processed = 0
        player_stats = {}  # Track wins/losses/ties per player
        
        for event in completed_events:
            try:
                # Get games for this event (just the IDs and player refs)
                games = await self.conn.fetch(
                    """
                    SELECT g.id, g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
                           g.score_team1, g.score_team2, g.result,
                           p1.display_name as t1p1_name, p2.display_name as t1p2_name,
                           p3.display_name as t2p1_name, p4.display_name as t2p2_name
                    FROM games g
                    JOIN group_players gp1 ON gp1.id = g.team1_p1
                    JOIN group_players gp2 ON gp2.id = g.team1_p2
                    JOIN group_players gp3 ON gp3.id = g.team2_p1
                    JOIN group_players gp4 ON gp4.id = g.team2_p2
                    JOIN players p1 ON p1.id = gp1.player_id
                    JOIN players p2 ON p2.id = gp2.player_id
                    JOIN players p3 ON p3.id = gp3.player_id
                    JOIN players p4 ON p4.id = gp4.player_id
                    WHERE g.event_id = $1
                    ORDER BY g.round_index, g.court_index
                    """,
                    event["id"]
                )
                
                if not games:
                    continue
                
                # Process each game individually
                for game in games:
                    if game["result"] == "UNSET":
                        continue
                    
                    # Get current ratings for all 4 players
                    t1p1_rating = current_ratings.get(game["team1_p1"], base_rating)
                    t1p2_rating = current_ratings.get(game["team1_p2"], base_rating)
                    t2p1_rating = current_ratings.get(game["team2_p1"], base_rating)
                    t2p2_rating = current_ratings.get(game["team2_p2"], base_rating)
                    
                    # Calculate team ELOs (average of players)
                    team1_elo = (t1p1_rating + t1p2_rating) / 2
                    team2_elo = (t2p1_rating + t2p2_rating) / 2
                    
                    # Store team ELO in the games table
                    await self.conn.execute(
                        """
                        UPDATE games SET team1_elo = $1, team2_elo = $2 WHERE id = $3
                        """,
                        team1_elo,
                        team2_elo,
                        game["id"]
                    )
                    
                    # Build game for rating calculation
                    game_for_rating = GameForRating(
                        team1=(
                            PlayerRating(player_id=game["team1_p1"], rating=t1p1_rating, display_name=game["t1p1_name"]),
                            PlayerRating(player_id=game["team1_p2"], rating=t1p2_rating, display_name=game["t1p2_name"]),
                        ),
                        team2=(
                            PlayerRating(player_id=game["team2_p1"], rating=t2p1_rating, display_name=game["t2p1_name"]),
                            PlayerRating(player_id=game["team2_p2"], rating=t2p2_rating, display_name=game["t2p2_name"]),
                        ),
                        result=DomainGameResult(game["result"]),
                        score_team1=float(game["score_team1"]) if game.get("score_team1") is not None else None,
                        score_team2=float(game["score_team2"]) if game.get("score_team2") is not None else None,
                    )
                    
                    # Calculate deltas for this game
                    deltas = rating_system.calculate_deltas([game_for_rating], current_ratings)
                    
                    # Update local ratings dictionary
                    for player_id, delta in deltas.items():
                        current_ratings[player_id] = delta.rating_after
                    
                    # Track wins/losses/ties
                    for player_id, team in [
                        (game["team1_p1"], 1), (game["team1_p2"], 1),
                        (game["team2_p1"], 2), (game["team2_p2"], 2)
                    ]:
                        if player_id not in player_stats:
                            player_stats[player_id] = {"wins": 0, "losses": 0, "ties": 0, "games": 0}
                        
                        player_stats[player_id]["games"] += 1
                        if game["result"] == "TIE":
                            player_stats[player_id]["ties"] += 1
                        elif game["result"] == "TEAM1_WIN":
                            if team == 1:
                                player_stats[player_id]["wins"] += 1
                            else:
                                player_stats[player_id]["losses"] += 1
                        else:  # TEAM2_WIN
                            if team == 2:
                                player_stats[player_id]["wins"] += 1
                            else:
                                player_stats[player_id]["losses"] += 1
                
                events_processed += 1
            except Exception as e:
                print(f"Error processing event {event['id']}: {e}")
        
        # Apply final ratings and stats to database
        for player_id, rating in current_ratings.items():
            stats = player_stats.get(player_id, {"wins": 0, "losses": 0, "ties": 0, "games": 0})
            await self.conn.execute(
                """
                UPDATE group_players 
                SET rating = $1, games_played = $2, wins = $3, losses = $4, ties = $5
                WHERE id = $6
                """,
                rating,
                stats["games"],
                stats["wins"],
                stats["losses"],
                stats["ties"],
                player_id
            )
        
        # Get final player ratings
        final_ratings = await self.conn.fetch(
            """
            SELECT gp.id, p.display_name, gp.rating, gp.wins, gp.losses, gp.ties
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.group_id = $1
            ORDER BY gp.rating DESC
            """,
            group_id
        )
        
        return {
            "eventsRecalculated": events_processed,
            "playersUpdated": len(final_ratings),
            "topPlayers": [
                {
                    "displayName": r["display_name"],
                    "rating": float(r["rating"]),
                    "wins": r["wins"],
                    "losses": r["losses"],
                }
                for r in final_ratings[:5]
            ]
        }

    async def archive_group(self, user_id: str, group_id: UUID) -> GroupResponse:
        """Archive a group."""
        group = await self.groups_repo.get_by_id(group_id)
        
        if not group:
            raise NotFoundError("Group", str(group_id))
            
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")
            
        archived = await self.groups_repo.archive(group_id)
        return self._to_response(archived)

    def _to_response(self, group: Dict[str, Any]) -> GroupResponse:
        """Convert a group dict to a response."""
        settings = GroupSettings(**group["settings"])
        return GroupResponse(
            id=group["id"],
            name=group["name"],
            sport=group["sport"],
            settings=settings,
            created_at=group["created_at"],
            updated_at=group.get("updated_at"),
            is_archived=group.get("is_archived", False),
        )




