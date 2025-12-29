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
from app.infrastructure.repositories.games_repo import GamesRepository
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository
from app.infrastructure.repositories.rating_updates_repo import RatingUpdatesRepository


class GroupService:
    """Service for group operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.rating_updates_repo = RatingUpdatesRepository(conn)
        self.games_repo = GamesRepository(conn)

    async def _is_owner_or_organizer(self, user_id: str, group: dict) -> bool:
        """Check if the user is the group owner or has ORGANIZER role."""
        # Check if user is the owner
        if str(group["owner_user_id"]) == user_id:
            return True
        # Check if user is an organizer
        return await self.group_players_repo.is_organizer(user_id, group["id"])

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

        # Check ownership
        if str(group["owner_user_id"]) == user_id:
             return self._to_response(group)
             
        # Check membership
        is_member = await self.group_players_repo.is_member(user_id, group_id)
        if is_member:
             return self._to_response(group)

        raise ForbiddenError("You don't have access to this group")

    async def update_settings(
        self, user_id: str, group_id: UUID, data: GroupSettingsUpdate
    ) -> GroupResponse:
        """Update group settings."""
        # Get current group
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can update group settings")

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

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can update the group")

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
        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can recalculate ratings")
        
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
        
        # Delete all existing rating_updates for this group's events
        # This is needed to regenerate accurate +/- deltas
        await self.conn.execute(
            """
            DELETE FROM rating_updates 
            WHERE event_id IN (
                SELECT id FROM events WHERE group_id = $1
            )
            """,
            group_id
        )
        
        for event in completed_events:
            try:
                # Get games for this event (including round_index for round-by-round processing)
                games = await self.conn.fetch(
                    """
                    SELECT g.id, g.round_index, g.team1_p1, g.team1_p2, g.team2_p1, g.team2_p2,
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
                
                # Snapshot ratings BEFORE this event for the rating_updates table
                # Get all players involved in this event's games
                event_players = set()
                for game in games:
                    event_players.update([game["team1_p1"], game["team1_p2"], game["team2_p1"], game["team2_p2"]])
                
                ratings_before_event = {
                    player_id: current_ratings.get(player_id, base_rating)
                    for player_id in event_players
                }
                
                # Group games by round_index for round-by-round processing
                from collections import defaultdict
                games_by_round = defaultdict(list)
                for game in games:
                    if game["result"] != "UNSET":
                        games_by_round[game["round_index"]].append(game)
                
                # Process each round in order
                for round_index in sorted(games_by_round.keys()):
                    round_games = games_by_round[round_index]
                    
                    # Build all games in this round for rating calculation
                    games_for_rating = []
                    for game in round_games:
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
                        
                        games_for_rating.append(GameForRating(
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
                        ))
                    
                    # Calculate deltas for all games in this round together
                    deltas = rating_system.calculate_deltas(games_for_rating, current_ratings)
                    
                    # Update local ratings dictionary for next round
                    for player_id, delta in deltas.items():
                        current_ratings[player_id] = delta.rating_after
                    
                    # Track wins/losses/ties for all players in this round
                    for game in round_games:
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
                
                # Create rating_updates records for this event
                rating_updates = []
                for player_id in event_players:
                    rating_before = ratings_before_event.get(player_id, base_rating)
                    rating_after = current_ratings.get(player_id, rating_before)
                    delta = rating_after - rating_before
                    if delta != 0:  # Only record if there was a change
                        rating_updates.append((
                            event["id"],
                            player_id,
                            rating_before,
                            rating_after,
                            delta,
                            settings.get("ratingSystem", "SERIOUS_ELO"),
                        ))
                
                if rating_updates:
                    await self.conn.executemany(
                        """
                        INSERT INTO rating_updates (event_id, group_player_id, rating_before, rating_after, delta, system)
                        VALUES ($1, $2, $3, $4, $5, $6)
                        """,
                        rating_updates
                    )
                
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
            
        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can archive a group")
            
        archived = await self.groups_repo.archive(group_id)
        return self._to_response(archived)

    async def duplicate_group(self, user_id: str, group_id: UUID) -> GroupResponse:
        """
        Duplicate a group with its settings and players, but without history.
        
        Creates a new group with:
        - Same settings
        - Same players (with reset ratings to initialRating)
        - No events, games, or rating history
        """
        # Get original group
        original = await self.groups_repo.get_by_id(group_id)
        if not original:
            raise NotFoundError("Group", str(group_id))
        
        # Check access - must be owner or organizer to duplicate
        if not await self._is_owner_or_organizer(user_id, original):
            raise ForbiddenError("Only owners and organizers can duplicate a group")
        
        # Create new group with copied settings
        settings = original["settings"]
        initial_rating = settings.get("initialRating", 1000)
        
        new_group = await self.groups_repo.create(
            owner_user_id=user_id,
            name=f"{original['name']} (Copy)",
            sport=original["sport"],
            settings=settings,
        )
        
        # Get all players from original group
        original_players = await self.conn.fetch(
            """
            SELECT player_id, membership_type, skill_level, role
            FROM group_players WHERE group_id = $1
            """,
            group_id
        )
        
        # Copy players to new group with reset ratings
        for player in original_players:
            # Calculate initial rating based on skill level
            player_rating = initial_rating
            skill_level = player.get("skill_level")
            if skill_level:
                offset_multiplier = initial_rating / 1000
                if skill_level == "ADVANCED":
                    player_rating = initial_rating + int(100 * offset_multiplier)
                elif skill_level == "BEGINNER":
                    player_rating = initial_rating - int(100 * offset_multiplier)
            
            await self.conn.execute(
                """
                INSERT INTO group_players (group_id, player_id, rating, membership_type, skill_level, role)
                VALUES ($1, $2, $3, $4, $5, $6)
                """,
                new_group["id"],
                player["player_id"],
                player_rating,
                player["membership_type"],
                player.get("skill_level"),
                player.get("role"),
            )
        
        return self._to_response(new_group)

    def _to_response(self, group: Dict[str, Any]) -> GroupResponse:
        """Convert a group dict to a response."""
        settings = GroupSettings(**group["settings"])
        return GroupResponse(
            id=group["id"],
            owner_user_id=group["owner_user_id"],
            name=group["name"],
            sport=group["sport"],
            settings=settings,
            created_at=group["created_at"],
            updated_at=group.get("updated_at"),
            is_archived=group.get("is_archived", False),
        )





    async def get_player_stats(self, user_id: str, group_id: UUID, player_id: UUID) -> Dict[str, Any]:
        """Get player stats and history."""
        # Get group to verify access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        # Check access (owner, organizer, or member)
        is_owner = str(group["owner_user_id"]) == user_id
        if not is_owner:
            is_member = await self.group_players_repo.is_member(user_id, group_id)
            if not is_member:
                raise ForbiddenError("You don't have access to this group")

        # Get group player by player_id
        # Note: We need the group_player_id, so we need to look it up using group_id and player_id
        # The repo has get_by_id (group_player_id) but we have player_id.
        # Let's assume the router passes player_id (which is the global player id).
        # We need to find the group_player entry.
        
        # We can implement a helper or just query it.
        # Actually, let's look at list_by_group result or add a method.
        # But wait, we can just use SQL here or add a repo method.
        # Let's add a repo method get_by_group_and_player later if needed, but for now lets query or iterate?
        # No, iterating is bad.
        
        # Let's assume the UI passes the PLAYER ID, so we need to find the group_player_id.
        # Or does the UI pass group_player_id? The URL is /groups/:groupId/players/:playerId.
        # Typically playerId refers to the global player ID or the group player ID.
        # In this codebase, /groups/:id/players usually lists group players which have IDs.
        # Let's verify what ID the frontend uses.
        # In PlayersPage.vue, it uses player.id.
        # list_by_group returns group_player.id as 'id', and player_id as 'player_id'.
        # So the ID in the list is the GROUP_PLAYER_ID.
        # OK, so the frontend will assume the ID is the GroupPlayerID.
        
        group_player = await self.group_players_repo.get_by_id(player_id)
        if not group_player or str(group_player["group_id"]) != str(group_id):
             # If passed ID is actually a raw player_id, we might want to handle that?
             # For now assume it is group_player_id as that's what's in the list.
             raise NotFoundError("Player", str(player_id))

        # Get history
        history = await self.rating_updates_repo.get_history_by_group_player(player_id)
        
        # Get all games to calculate advanced stats
        games = await self.games_repo.list_by_player(player_id)
        
        advanced_stats = self._calculate_advanced_stats(player_id, history, games)
        
        return {
            "player": group_player,
            "history": history,
            "advanced": advanced_stats
        }

    def _calculate_advanced_stats(self, player_id: UUID, history: List[Dict], games: List[Dict]) -> Dict:
        """Calculate advanced player stats."""
        from collections import defaultdict
        
        if not history and not games:
            return None
            
        # 1. Highest / Lowest Rating
        ratings = [float(h["rating"]) for h in history]
        # Include current rating if history is empty but player exists? 
        # Actually history contains all updates.
        
        if ratings:
            highest_rating = max(ratings)
            lowest_rating = min(ratings)
        else:
            highest_rating = 0
            lowest_rating = 0
            
        # 2. Streaks
        # Games are ordered by date, round_index
        current_win_streak = 0
        current_loss_streak = 0
        longest_win_streak = 0
        longest_loss_streak = 0
        
        # 3. Teammates and Opponents
        teammate_stats = defaultdict(lambda: {"wins": 0, "games": 0, "name": ""})
        opponent_stats = defaultdict(lambda: {"wins": 0, "losses": 0, "name": ""})
        
        for game in games:
            # Determine my team and result
            my_team = 0
            if game["team1_p1"] == player_id or game["team1_p2"] == player_id:
                my_team = 1
            else:
                my_team = 2
                
            # Skip if result is unset
            if game["result"] == "UNSET":
                continue
                
            is_win = False
            if my_team == 1 and game["result"] == "TEAM1_WIN":
                is_win = True
            elif my_team == 2 and game["result"] == "TEAM2_WIN":
                is_win = True
            elif game["result"] == "TIE":
                # Treat ties as breaking streaks? Or ignore?
                # Usually ties break win/loss streaks
                current_win_streak = 0
                current_loss_streak = 0
                continue
                
            # Update streaks
            if is_win:
                current_win_streak += 1
                current_loss_streak = 0
                longest_win_streak = max(longest_win_streak, current_win_streak)
            else:
                current_loss_streak += 1
                current_win_streak = 0
                longest_loss_streak = max(longest_loss_streak, current_loss_streak)
                
            # Teammate Stats
            teammate_id = None
            teammate_name = None
            
            if my_team == 1:
                if game["team1_p1"] == player_id:
                    teammate_id = game["team1_p2"]
                    teammate_name = game["t1p2_name"]
                else:
                    teammate_id = game["team1_p1"]
                    teammate_name = game["t1p1_name"]
            else:
                if game["team2_p1"] == player_id:
                    teammate_id = game["team2_p2"]
                    teammate_name = game["t2p2_name"]
                else:
                    teammate_id = game["team2_p1"]
                    teammate_name = game["t2p1_name"]
            
            if teammate_id:
                stats = teammate_stats[teammate_id]
                stats["games"] += 1
                stats["name"] = teammate_name
                if is_win:
                    stats["wins"] += 1
                    
            # Opponent Stats (Nemesis / Pigeon)
            opponents = []
            if my_team == 1:
                opponents = [
                    (game["team2_p1"], game["t2p1_name"]), 
                    (game["team2_p2"], game["t2p2_name"])
                ]
            else:
                opponents = [
                    (game["team1_p1"], game["t1p1_name"]), 
                    (game["team1_p2"], game["t1p2_name"])
                ]
                
            for opp_id, opp_name in opponents:
                stats = opponent_stats[opp_id]
                stats["name"] = opp_name
                if is_win:
                    stats["wins"] += 1 # I beat them
                else:
                    stats["losses"] += 1 # They beat me
        
        # Format Teammates
        def format_teammate(tid, stat):
            return {
                "playerId": tid,
                "displayName": stat["name"],
                "gamesPlayed": stat["games"],
                "wins": stat["wins"],
                "losses": stat["games"] - stat["wins"],
                "winRate": stat["wins"] / stat["games"] if stat["games"] > 0 else 0
            }

        # Filter teammates (min 2 games to be significant)
        all_teammates = [
            format_teammate(tid, stat) 
            for tid, stat in teammate_stats.items() 
            if stat["games"] >= 2
        ]

        if not all_teammates:
            best_teammates = []
            worst_teammates = []
        else:
            # Best Teammates Logic:
            # 1. Find absolute max win rate
            max_wr = max(t["winRate"] for t in all_teammates)
            # 2. Filter for those with max win rate
            best_candidates = [t for t in all_teammates if t["winRate"] >= max_wr - 0.0001]
            # 3. Among these, find absolute max games played
            if best_candidates:
                max_games_best = max(t["gamesPlayed"] for t in best_candidates)
                # 4. Filter for those with max games played
                best_candidates = [t for t in best_candidates if t["gamesPlayed"] == max_games_best]
            
            # Worst Teammates Logic:
            # 1. Find absolute min win rate
            min_wr = min(t["winRate"] for t in all_teammates)
            # 2. Filter for those with min win rate
            worst_candidates = [t for t in all_teammates if t["winRate"] <= min_wr + 0.0001]
            # 3. Among these, find absolute max games played (proven worst)
            if worst_candidates:
                max_games_worst = max(t["gamesPlayed"] for t in worst_candidates)
                # 4. Filter for those with max games played
                worst_candidates = [t for t in worst_candidates if t["gamesPlayed"] == max_games_worst]
            
            # Remove Overlaps
            # If a player appears in both lists, assign based on win rate threshold
            best_ids = {t["playerId"] for t in best_candidates}
            worst_ids = {t["playerId"] for t in worst_candidates}
            common_ids = best_ids.intersection(worst_ids)
            
            final_best = []
            for t in best_candidates:
                if t["playerId"] in common_ids:
                    if t["winRate"] >= 0.5:
                        final_best.append(t)
                else:
                    final_best.append(t)

            final_worst = []
            for t in worst_candidates:
                if t["playerId"] in common_ids:
                    if t["winRate"] < 0.5:
                        final_worst.append(t)
                else:
                    final_worst.append(t)
            
            best_teammates = final_best
            worst_teammates = final_worst
        
        # Format Opponents
        nemesis = None
        pigeon = None
        
        # Nemesis: Opponent with highest win rate against me (min 3 games)
        # Pigeon: Opponent I have highest win rate against (min 3 games)
        
        relevant_opponents = []
        for oid, stat in opponent_stats.items():
            total = stat["wins"] + stat["losses"]
            if total >= 3:
                win_rate_vs = stat["wins"] / total # My win rate vs them
                relevant_opponents.append({
                    "playerId": oid,
                    "displayName": stat["name"],
                    "gamesPlayed": total,
                    "wins": stat["wins"],
                    "losses": stat["losses"],
                    "winRate": win_rate_vs
                })
        
        if relevant_opponents:
            # Pigeon = highest win rate for me
            pigeon_data = max(relevant_opponents, key=lambda x: (x["winRate"], x["gamesPlayed"]))
            if pigeon_data["winRate"] > 0.5: # Only if I actually win more
                pigeon = pigeon_data
                
            # Nemesis = lowest win rate for me
            nemesis_data = min(relevant_opponents, key=lambda x: (x["winRate"], x["gamesPlayed"] * -1))
            if nemesis_data["winRate"] < 0.5: # Only if they actually beat me more
                nemesis = nemesis_data

        return {
            "highestRating": highest_rating,
            "lowestRating": lowest_rating,
            "longestWinStreak": longest_win_streak,
            "longestLossStreak": longest_loss_streak,
            "currentWinStreak": current_win_streak,
            "currentLossStreak": current_loss_streak,
            "bestTeammates": best_teammates,
            "worstTeammates": worst_teammates,
            "nemesis": nemesis,
            "pigeon": pigeon
        }



