"""
Event service - handles event-related use cases.
"""
import csv
import io
from collections import defaultdict
from datetime import datetime
from typing import Any, Dict, FrozenSet, List, Optional, Set
from uuid import UUID

from asyncpg import Connection
from fastapi import UploadFile
from fastapi import UploadFile

from app.api.schemas.events import (
    CompleteResponse,
    EventCreate,
    EventListItem,
    EventResponse,
    EventStatus,
    GameResponse,
    GameResult,
    GenerateResponse,
    GenerationMeta,
    PlayerInfo,
    RatingUpdate,
    SwapResponse,
)
from app.api.schemas.event_updates import EventUpdate
from app.domain.matchmaking.constraints import ConstraintChecker, ConstraintConfig, Player
from app.domain.matchmaking.generator import ScheduleGenerator
from app.domain.ratings.base import GameForRating, GameResult as DomainGameResult, PlayerRating
from app.domain.ratings.factory import create_rating_system
from app.exceptions import BadRequestError, ForbiddenError, MatchmakingError, NotFoundError
from app.infrastructure.repositories.events_repo import EventsRepository
from app.infrastructure.repositories.games_repo import GamesRepository
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository
from app.infrastructure.repositories.rating_updates_repo import RatingUpdatesRepository
from app.logging_config import get_logger

logger = get_logger(__name__)


class EventService:
    """Service for event operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.events_repo = EventsRepository(conn)
        self.games_repo = GamesRepository(conn)
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.rating_updates_repo = RatingUpdatesRepository(conn)

    async def create_event(
        self, user_id: str, group_id: UUID, data: EventCreate
    ) -> EventResponse:
        """Create a new event."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Validate participant count
        required_players = data.courts * 4
        if len(data.participant_ids) != required_players:
            raise BadRequestError(
                f"Event requires exactly {required_players} participants for {data.courts} courts"
            )

        # Verify all participants exist in group
        group_players = await self.group_players_repo.list_by_group(group_id)
        gp_ids = {gp["id"] for gp in group_players}
        for pid in data.participant_ids:
            if pid not in gp_ids:
                raise BadRequestError(f"Player {pid} not found in group")

        # Create event
        event = await self.events_repo.create(
            group_id=group_id,
            name=data.name,
            starts_at=data.starts_at,
            courts=data.courts,
            rounds=data.rounds,
        )

        # Add participants
        await self.events_repo.add_participants(event["id"], data.participant_ids)

        return EventResponse(
            id=event["id"],
            name=event["name"],
            status=EventStatus(event["status"]),
            startsAt=event["starts_at"],
            courts=event["courts"],
            rounds=event["rounds"],
            participantCount=len(data.participant_ids),
            generationMeta=None,
            games=[],
        )

    async def list_events(
        self, user_id: str, group_id: UUID, status: Optional[EventStatus] = None
    ) -> List[EventListItem]:
        """List events in a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        events = await self.events_repo.list_by_group(
            group_id, status.value if status else None
        )

        return [
            EventListItem(
                id=e["id"],
                name=e["name"],
                status=EventStatus(e["status"]),
                startsAt=e["starts_at"],
                courts=e["courts"],
                rounds=e["rounds"],
            )
            for e in events
        ]

    async def get_event(self, user_id: str, event_id: UUID) -> EventResponse:
        """Get event details with games."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))
        if str(event["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        participant_count = await self.events_repo.get_participant_count(event_id)
        games = await self._get_games_with_players(event_id)

        gen_meta = None
        if event["generation_meta"]:
            gen_meta = GenerationMeta(
                seedUsed=event["generation_meta"].get("seed_used", ""),
                eloDiffConfigured=event["generation_meta"].get("elo_diff_configured", 0),
                eloDiffUsed=event["generation_meta"].get("elo_diff_used", 0),
                relaxIterations=event["generation_meta"].get("relax_iterations", 0),
                attempts=event["generation_meta"].get("attempts", 0),
                durationMs=event["generation_meta"].get("duration_ms", 0),
                constraintToggles=event["generation_meta"].get("constraint_toggles", {}),
            )

        return EventResponse(
            id=event["id"],
            name=event["name"],
            status=EventStatus(event["status"]),
            startsAt=event["starts_at"],
            courts=event["courts"],
            rounds=event["rounds"],
            participantCount=participant_count,
            generationMeta=gen_meta,
            games=games,
        )

    async def update_event(self, user_id: str, event_id: UUID, data: "EventUpdate") -> EventResponse:
        """Update event details."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))

        # Verify ownership
        group = await self.groups_repo.get_by_id(event["group_id"])
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        # Update fields
        updates = {}
        if data.name is not None:
            updates["name"] = data.name

        if updates:
            await self.events_repo.update(event_id, updates)
            # Fetch updated
            event = await self.events_repo.get_by_id(event_id)

        # Get games (needed for response)
        games = await self._get_games_with_players(event_id)
        
        participant_count = await self.events_repo.get_participant_count(event_id)

        gen_meta = None
        if event["generation_meta"]:
            gen_meta = GenerationMeta(
                seedUsed=event["generation_meta"].get("seed_used", ""),
                eloDiffConfigured=event["generation_meta"].get("elo_diff_configured", 0),
                eloDiffUsed=event["generation_meta"].get("elo_diff_used", 0),
                relaxIterations=event["generation_meta"].get("relax_iterations", 0),
                attempts=event["generation_meta"].get("attempts", 0),
                durationMs=event["generation_meta"].get("duration_ms", 0),
                constraintToggles=event["generation_meta"].get("constraint_toggles", {}),
            )

        return EventResponse(
            id=event["id"],
            name=event["name"],
            status=EventStatus(event["status"]),
            startsAt=event["starts_at"],
            courts=event["courts"],
            rounds=event["rounds"],
            participantCount=participant_count,
            generationMeta=gen_meta,
            games=games,
        )

    async def generate_schedule(
        self, user_id: str, event_id: UUID, new_seed: bool = False
    ) -> GenerateResponse:
        """Generate match schedule for an event."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))
        if str(event["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        if event["status"] == "COMPLETED":
            raise BadRequestError("Cannot regenerate a completed event")

        # Get group settings
        group = await self.groups_repo.get_by_id(event["group_id"])
        settings = group["settings"]

        # Get participants with ratings
        participants = await self.events_repo.get_participants(event_id)
        players = [
            Player(
                id=p["group_player_id"],
                rating=float(p["rating"]),
                display_name=p["display_name"],
            )
            for p in participants
        ]

        # Get previous event teammate pairs
        previous_pairs: Set[FrozenSet[UUID]] = set()
        if settings.get("noRepeatTeammateFromPreviousEvent", True):
            prev_event = await self.events_repo.get_previous_event(
                event["group_id"], event_id
            )
            if prev_event:
                pairs = await self.games_repo.get_teammate_pairs_from_event(
                    prev_event["id"]
                )
                previous_pairs = {frozenset(p) for p in pairs}

        # Create constraint config
        config = ConstraintConfig(
            no_repeat_teammate_in_event=settings.get("noRepeatTeammateInEvent", True),
            no_repeat_teammate_from_previous_event=settings.get(
                "noRepeatTeammateFromPreviousEvent", True
            ),
            no_repeat_opponent_in_event=settings.get("noRepeatOpponentInEvent", True),
            elo_diff=settings.get("eloDiff", 0.05),
            auto_relax_elo_diff=settings.get("autoRelaxEloDiff", True),
            auto_relax_step=settings.get("autoRelaxStep", 0.01),
            auto_relax_max_elo_diff=settings.get("autoRelaxMaxEloDiff", 0.25),
        )

        # Generate seed
        seed = None if new_seed else str(event_id)

        # Generate schedule
        generator = ScheduleGenerator(
            players=players,
            courts=event["courts"],
            rounds=event["rounds"],
            config=config,
            previous_teammate_pairs=previous_pairs,
            seed=seed,
        )

        result = generator.generate()

        if not result.success:
            raise MatchmakingError(result.error_message or "Failed to generate schedule")

        # Delete existing games and create new ones
        await self.games_repo.delete_by_event(event_id)

        # Build player rating lookup for team ELO calculation
        player_ratings = {p.id: p.rating for p in players}

        games_to_create = []
        for g in result.games:
            # Calculate team ELO as average of player ratings
            team1_elo = (player_ratings[g.team1[0]] + player_ratings[g.team1[1]]) / 2
            team2_elo = (player_ratings[g.team2[0]] + player_ratings[g.team2[1]]) / 2
            
            games_to_create.append({
                "event_id": event_id,
                "round_index": g.round_index,
                "court_index": g.court_index,
                "team1_p1": g.team1[0],
                "team1_p2": g.team1[1],
                "team2_p1": g.team2[0],
                "team2_p2": g.team2[1],
                "team1_elo": team1_elo,
                "team2_elo": team2_elo,
            })

        await self.games_repo.create_many(games_to_create)

        # Update event status
        await self.events_repo.update_status(
            event_id, "GENERATED", result.metadata
        )

        # Get games with player info
        games = await self._get_games_with_players(event_id)

        return GenerateResponse(
            status=EventStatus.GENERATED,
            generationMeta=GenerationMeta(
                seedUsed=result.metadata["seed_used"],
                eloDiffConfigured=result.metadata["elo_diff_configured"],
                eloDiffUsed=result.metadata["elo_diff_used"],
                relaxIterations=result.metadata["relax_iterations"],
                attempts=result.metadata["attempts"],
                durationMs=result.metadata["duration_ms"],
                constraintToggles=result.metadata["constraint_toggles"],
            ),
            games=games,
        )

    async def swap_players(
        self,
        user_id: str,
        event_id: UUID,
        round_index: int,
        player1_id: UUID,
        player2_id: UUID,
    ) -> SwapResponse:
        """Swap two players within a round."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))
        if str(event["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        if event["status"] == "COMPLETED":
            raise BadRequestError("Cannot swap players in a completed event")

        # Get all games in the round
        all_games = await self.games_repo.list_by_event(event_id)
        round_games = [g for g in all_games if g["round_index"] == round_index]

        if not round_games:
            raise BadRequestError(f"No games found for round {round_index}")

        # Find which games contain each player
        game1 = None
        game2 = None
        pos1 = None
        pos2 = None

        for game in round_games:
            for pos in ["team1_p1", "team1_p2", "team2_p1", "team2_p2"]:
                if game[pos] == player1_id:
                    game1 = game
                    pos1 = pos
                if game[pos] == player2_id:
                    game2 = game
                    pos2 = pos

        if game1 is None:
            raise BadRequestError(f"Player {player1_id} not found in round {round_index}")
        if game2 is None:
            raise BadRequestError(f"Player {player2_id} not found in round {round_index}")

        # Perform swap
        if game1["id"] == game2["id"]:
            # Same game - just swap positions
            await self.games_repo.swap_players(
                game1["id"], pos1, pos2, player1_id, player2_id
            )
        else:
            # Different games - update each game
            await self.conn.execute(
                f"UPDATE games SET {pos1} = $2, swapped = TRUE WHERE id = $1",
                game1["id"],
                player2_id,
            )
            await self.conn.execute(
                f"UPDATE games SET {pos2} = $2, swapped = TRUE WHERE id = $1",
                game2["id"],
                player1_id,
            )

        # Update status to IN_PROGRESS if it was GENERATED
        if event["status"] == "GENERATED":
            await self.events_repo.update_status(event_id, "IN_PROGRESS")

        # Check for warnings
        warnings = []
        # TODO: Implement constraint warnings for swaps

        return SwapResponse(success=True, warnings=warnings)

    async def update_score(
        self,
        user_id: str,
        game_id: UUID,
        score_team1: Optional[float],
        score_team2: Optional[float],
    ) -> GameResponse:
        """Update game score."""
        game = await self.games_repo.get_by_id(game_id)
        if not game:
            raise NotFoundError("Game", str(game_id))

        # Verify ownership through group
        group = await self.groups_repo.get_by_id(game["group_id"])
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        # Check event status
        event = await self.events_repo.get_by_id(game["event_id"])
        
        # ALLOW updates for COMPLETED events (Request #4)
        # if event["status"] == "COMPLETED":
        #     raise BadRequestError("Cannot update score of a completed event")

        # Update score
        updated = await self.games_repo.update_score(game_id, score_team1, score_team2)

        # Update event status to IN_PROGRESS if needed
        if event["status"] == "GENERATED":
            await self.events_repo.update_status(event["id"], "IN_PROGRESS")
            
        # If event was COMPLETED, trigger recalculation
        if event["status"] == "COMPLETED":
            # Recalculate ratings for the whole group
            # We import locally to avoid circular dependencies
            from app.application.services.group_service import GroupService
            group_service = GroupService(self.conn)
            await group_service.recalculate_ratings(user_id, group["id"])

        # Get player info
        games_with_players = await self._get_games_with_players(game["event_id"])
        for g in games_with_players:
            if g.id == game_id:
                return g

        raise NotFoundError("Game", str(game_id))

    async def complete_event(self, user_id: str, event_id: UUID) -> CompleteResponse:
        """Complete an event and calculate rating updates."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))
        if str(event["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")

        if event["status"] == "COMPLETED":
            raise BadRequestError("Event is already completed")

        if event["status"] == "DRAFT":
            raise BadRequestError("Cannot complete an event without generated games")

        # Get group settings for rating system
        group = await self.groups_repo.get_by_id(event["group_id"])
        settings = group["settings"]

        # Get all games with player details
        games = await self.games_repo.list_by_event_with_players(event_id)

        # Get current ratings for all participants
        participants = await self.events_repo.get_participants(event_id)
        participant_ids = {p["group_player_id"] for p in participants}
        current_ratings = {p["group_player_id"]: float(p["rating"]) for p in participants}

        # Build games for rating calculation
        games_for_rating: List[GameForRating] = []
        for game in games:
            if game["result"] == "UNSET":
                continue

            games_for_rating.append(
                GameForRating(
                    team1=(
                        PlayerRating(
                            player_id=game["team1_p1"],
                            rating=float(game["t1p1_rating"]),
                            display_name=game["t1p1_name"],
                        ),
                        PlayerRating(
                            player_id=game["team1_p2"],
                            rating=float(game["t1p2_rating"]),
                            display_name=game["t1p2_name"],
                        ),
                    ),
                    team2=(
                        PlayerRating(
                            player_id=game["team2_p1"],
                            rating=float(game["t2p1_rating"]),
                            display_name=game["t2p1_name"],
                        ),
                        PlayerRating(
                            player_id=game["team2_p2"],
                            rating=float(game["t2p2_rating"]),
                            display_name=game["t2p2_name"],
                        ),
                    ),
                    result=DomainGameResult(game["result"]),
                    score_team1=float(game["score_team1"]) if game.get("score_team1") is not None else None,
                    score_team2=float(game["score_team2"]) if game.get("score_team2") is not None else None,
                )
            )

        # Calculate rating deltas
        rating_system = create_rating_system(
            settings.get("ratingSystem", "SERIOUS_ELO"),
            k_factor=settings.get("kFactor", 32),
            elo_const=settings.get("eloConst"),  # None uses default for each system
        )

        deltas = rating_system.calculate_deltas(games_for_rating, current_ratings)

        # Apply rating updates - only for event participants
        rating_updates = []
        for player_id, delta in deltas.items():
            # Only process players who were event participants
            if player_id not in participant_ids:
                continue

            # Count wins/losses/ties for this player
            # Only count games where the player was actually present
            wins = losses = ties = games_played = 0
            for game in games:
                if game["result"] == "UNSET":
                    continue

                # Check if player was in this game
                player_team = None
                if player_id in [game["team1_p1"], game["team1_p2"]]:
                    player_team = 1
                elif player_id in [game["team2_p1"], game["team2_p2"]]:
                    player_team = 2

                # Only count games where the player was present
                if player_team:
                    games_played += 1
                    if game["result"] == "TIE":
                        ties += 1
                    elif game["result"] == "TEAM1_WIN":
                        if player_team == 1:
                            wins += 1
                        else:
                            losses += 1
                    else:  # TEAM2_WIN
                        if player_team == 2:
                            wins += 1
                        else:
                            losses += 1

            # Update player rating
            await self.group_players_repo.update_rating(
                group_player_id=player_id,
                rating=delta.rating_after,
                games_delta=games_played,
                wins_delta=wins,
                losses_delta=losses,
                ties_delta=ties,
            )

            rating_updates.append({
                "event_id": event_id,
                "group_player_id": player_id,
                "rating_before": delta.rating_before,
                "rating_after": delta.rating_after,
                "delta": delta.delta,
                "system": settings.get("ratingSystem", "SERIOUS_ELO"),
            })

        # Save rating updates audit trail
        await self.rating_updates_repo.create_many(rating_updates)

        # Update event status
        await self.events_repo.update_status(event_id, "COMPLETED")

        return CompleteResponse(
            status=EventStatus.COMPLETED,
            ratingUpdates=[
                RatingUpdate(
                    playerId=d.player_id,
                    displayName=d.display_name,
                    ratingBefore=d.rating_before,
                    ratingAfter=d.rating_after,
                    delta=d.delta,
                )
                for d in deltas.values()
            ],
        )

    async def delete_event(self, user_id: str, event_id: UUID) -> None:
        """Delete an event (only if not completed)."""
        event = await self.events_repo.get_by_id(event_id)
        if not event:
            raise NotFoundError("Event", str(event_id))
        if str(event["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this event's group")
        
        if event["status"] == "COMPLETED":
            raise BadRequestError("Cannot delete a completed event")
        
        await self.events_repo.delete(event_id)

    async def _get_games_with_players(self, event_id: UUID) -> List[GameResponse]:
        """Get all games for an event with player details."""
        games = await self.games_repo.list_by_event_with_players(event_id)

        return [
            GameResponse(
                id=g["id"],
                roundIndex=g["round_index"],
                courtIndex=g["court_index"],
                team1=[
                    PlayerInfo(id=g["team1_p1"], displayName=g["t1p1_name"]),
                    PlayerInfo(id=g["team1_p2"], displayName=g["t1p2_name"]),
                ],
                team2=[
                    PlayerInfo(id=g["team2_p1"], displayName=g["t2p1_name"]),
                    PlayerInfo(id=g["team2_p2"], displayName=g["t2p2_name"]),
                ],
                scoreTeam1=float(g["score_team1"]) if g["score_team1"] is not None else None,
                scoreTeam2=float(g["score_team2"]) if g["score_team2"] is not None else None,
                # Use stored team ELO (historical) or calculate from current ratings
                team1Elo=float(g["team1_elo"]) if g.get("team1_elo") is not None else (
                    (float(g["t1p1_rating"]) + float(g["t1p2_rating"])) / 2
                ),
                team2Elo=float(g["team2_elo"]) if g.get("team2_elo") is not None else (
                    (float(g["t2p1_rating"]) + float(g["t2p2_rating"])) / 2
                ),
                result=GameResult(g["result"]),
            )
            for g in games
        ]

    async def import_history(
        self, user_id: str, group_id: UUID, file: UploadFile
    ) -> Dict[str, Any]:
        """Import historical game data from CSV file."""
        logger.info(f"Starting history import for group {group_id}")
        
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Read and parse CSV
        contents = await file.read()
        if not contents:
            logger.warning("CSV file is empty")
            raise BadRequestError("CSV file is empty")
        
        text = contents.decode("utf-8")
        if not text.strip():
            logger.warning("CSV file content is empty after decode")
            raise BadRequestError("CSV file is empty")
        
        logger.debug(f"CSV content length: {len(text)}")
        reader = csv.DictReader(io.StringIO(text))
        
        # Check if CSV has required columns
        if not reader.fieldnames:
            logger.warning("CSV file has no header row")
            raise BadRequestError("CSV file has no header row")
        
        logger.debug(f"CSV columns found: {reader.fieldnames}")
        required_columns = ["event_name", "event_date", "round_index", "court_index",
                           "team1_player1", "team1_player2", "team2_player1", "team2_player2",
                           "score_team1", "score_team2"]
        missing_columns = [col for col in required_columns if col not in reader.fieldnames]
        if missing_columns:
            error_msg = f"CSV missing required columns: {', '.join(missing_columns)}"
            logger.warning(error_msg)
            raise BadRequestError(error_msg)
        
        # Get all players in group for validation
        group_players = await self.group_players_repo.list_by_group(group_id)
        if not group_players:
            raise BadRequestError("Group has no players. Add players before importing history.")
        
        player_name_to_id = {gp["display_name"]: gp["id"] for gp in group_players}
        
        # Parse and validate rows
        rows = []
        errors = []
        for idx, row in enumerate(reader, start=2):  # Start at 2 (header is row 1)
            row_valid = True
            
            # Validate required fields
            required = ["event_name", "event_date", "round_index", "court_index",
                       "team1_player1", "team1_player2", "team2_player1", "team2_player2",
                       "score_team1", "score_team2"]
            for field in required:
                if field not in row or not row.get(field, "").strip():
                    errors.append(f"Row {idx}: Missing required field '{field}'")
                    row_valid = False
                    break
            
            if not row_valid:
                continue
            
            # Validate players exist
            players = [row["team1_player1"], row["team1_player2"], 
                      row["team2_player1"], row["team2_player2"]]
            for player_name in players:
                if player_name not in player_name_to_id:
                    errors.append(f"Row {idx}: Player '{player_name}' not found in group")
                    row_valid = False
                    break
            
            if not row_valid:
                continue
            
            # Parse and validate scores
            try:
                score1_str = row.get("score_team1", "").strip()
                score2_str = row.get("score_team2", "").strip()
                score1 = float(score1_str) if score1_str else None
                score2 = float(score2_str) if score2_str else None
            except (ValueError, AttributeError):
                errors.append(f"Row {idx}: Invalid score format (must be numbers)")
                continue
            
            # Parse date
            try:
                event_date = datetime.fromisoformat(row["event_date"].replace("Z", "+00:00"))
            except:
                try:
                    event_date = datetime.strptime(row["event_date"].strip(), "%Y-%m-%d")
                except:
                    errors.append(f"Row {idx}: Invalid date format (use YYYY-MM-DD)")
                    continue
            
            # Parse round and court indices
            try:
                round_index = int(row["round_index"])
                court_index = int(row["court_index"])
            except (ValueError, TypeError):
                errors.append(f"Row {idx}: Invalid round_index or court_index (must be integers)")
                continue
            
            # All validations passed, add row
            try:
                rows.append({
                    "event_name": row["event_name"].strip(),
                    "event_date": event_date,
                    "round_index": round_index,
                    "court_index": court_index,
                    "team1_p1": player_name_to_id[row["team1_player1"]],
                    "team1_p2": player_name_to_id[row["team1_player2"]],
                    "team2_p1": player_name_to_id[row["team2_player1"]],
                    "team2_p2": player_name_to_id[row["team2_player2"]],
                    "score_team1": score1,
                    "score_team2": score2,
                })
            except Exception as e:
                errors.append(f"Row {idx}: {str(e)}")
        
        if errors:
            error_msg = f"Import validation errors:\n" + "\n".join(errors[:10])
            logger.warning(f"CSV import validation failed: {error_msg}")
            raise BadRequestError(error_msg)
        
        if not rows:
            logger.warning("CSV import failed: No valid rows found")
            raise BadRequestError("No valid rows found in CSV")
        
        # Group by event (name + date)
        events_data = defaultdict(list)
        for row in rows:
            key = (row["event_name"], row["event_date"].date())
            events_data[key].append(row)
        
        # Sort events by date (chronological order for ELO)
        sorted_events = sorted(events_data.items(), key=lambda x: x[0][1])
        
        created_events = []
        total_games = 0
        
        # Create events and games in chronological order
        for (event_name, event_date), games_data in sorted_events:
            # Determine courts and rounds from data
            max_court = max(g["court_index"] for g in games_data)
            max_round = max(g["round_index"] for g in games_data)
            courts = max_court + 1
            rounds = max_round + 1
            
            # Create event
            event = await self.events_repo.create(
                group_id=group_id,
                name=event_name,
                starts_at=datetime.combine(event_date, datetime.min.time()),
                courts=courts,
                rounds=rounds,
            )
            
            # Get all unique participants
            participant_ids = set()
            for g in games_data:
                participant_ids.update([g["team1_p1"], g["team1_p2"], g["team2_p1"], g["team2_p2"]])
            
            await self.events_repo.add_participants(event["id"], list(participant_ids))
            
            # Create games
            games_to_create = []
            for g in games_data:
                games_to_create.append({
                    "event_id": event["id"],
                    "round_index": g["round_index"],
                    "court_index": g["court_index"],
                    "team1_p1": g["team1_p1"],
                    "team1_p2": g["team1_p2"],
                    "team2_p1": g["team2_p1"],
                    "team2_p2": g["team2_p2"],
                })
            
            await self.games_repo.create_many(games_to_create)
            
            # Update event status to GENERATED since we have games
            await self.events_repo.update_status(event["id"], "GENERATED")
            
            # Get created games to update scores
            created_games = await self.games_repo.list_by_event(event["id"])
            
            # Update scores - match games by round and court
            games_by_round_court = {
                (g["round_index"], g["court_index"]): g for g in created_games
            }
            for g in games_data:
                game = games_by_round_court.get((g["round_index"], g["court_index"]))
                if game:
                    await self.games_repo.update_score(
                        game["id"],
                        g["score_team1"],
                        g["score_team2"],
                    )
            
            # Update status to IN_PROGRESS since we have scores
            await self.events_repo.update_status(event["id"], "IN_PROGRESS")
            
            # Complete event to apply ELO (in chronological order)
            await self.complete_event(user_id, event["id"])
            
            created_events.append({
                "id": str(event["id"]),
                "name": event_name,
                "date": event_date.isoformat(),
                "games": len(games_data),
            })
            total_games += len(games_data)
        
        return {
            "eventsCreated": len(created_events),
            "gamesImported": total_games,
            "events": created_events,
        }




