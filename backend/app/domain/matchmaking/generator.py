"""
Match schedule generator with constraint satisfaction.
"""
import hashlib
import random
import time
from dataclasses import dataclass
from typing import Any, Dict, FrozenSet, List, Optional, Set, Tuple
from uuid import UUID

from app.domain.matchmaking.constraints import (
    ConstraintChecker,
    ConstraintConfig,
    Game,
    Player,
)


@dataclass
class GenerationResult:
    """Result of schedule generation."""

    success: bool
    games: List[Game]
    metadata: Dict[str, Any]
    error_message: Optional[str] = None


class ScheduleGenerator:
    """Generates match schedules satisfying constraints."""

    MAX_ATTEMPTS = 1000
    MAX_ROUND_ATTEMPTS = 100

    def __init__(
        self,
        players: List[Player],
        courts: int,
        rounds: int,
        config: ConstraintConfig,
        previous_teammate_pairs: Set[FrozenSet[UUID]] = None,
        seed: Optional[str] = None,
    ):
        if len(players) != courts * 4:
            raise ValueError(
                f"Number of players ({len(players)}) must equal courts * 4 ({courts * 4})"
            )

        self.players = {p.id: p for p in players}
        self.player_ids = [p.id for p in players]
        self.courts = courts
        self.rounds = rounds
        self.config = config
        self.checker = ConstraintChecker(config, previous_teammate_pairs)
        self.seed = seed or self._generate_seed()

    def _generate_seed(self) -> str:
        """Generate a random seed."""
        return hashlib.sha256(str(time.time()).encode()).hexdigest()[:12]

    def generate(self) -> GenerationResult:
        """
        Generate a complete schedule.

        Uses iterative relaxation if rating constraint cannot be satisfied.
        """
        start_time = time.time()
        attempts = 0
        relax_iterations = 0
        current_elo_diff = self.config.elo_diff

        while True:
            # Set seed for reproducibility
            random.seed(f"{self.seed}_{relax_iterations}")

            games, success, failure_reason = self._try_generate(current_elo_diff)
            attempts += 1

            if success:
                duration_ms = int((time.time() - start_time) * 1000)
                return GenerationResult(
                    success=True,
                    games=games,
                    metadata={
                        "seed_used": self.seed,
                        "elo_diff_configured": self.config.elo_diff,
                        "elo_diff_used": current_elo_diff,
                        "relax_iterations": relax_iterations,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "constraint_toggles": {
                            "no_repeat_teammate_in_event": self.config.no_repeat_teammate_in_event,
                            "no_repeat_teammate_from_previous_event": self.config.no_repeat_teammate_from_previous_event,
                            "no_repeat_opponent_in_event": self.config.no_repeat_opponent_in_event,
                        },
                    },
                )

            # Only relax elo_diff if failure was due to rating constraints
            # If failure is due to hard constraints, relaxing elo_diff won't help
            if self.config.auto_relax_elo_diff and failure_reason == 'rating':
                current_elo_diff += self.config.auto_relax_step
                relax_iterations += 1

                if current_elo_diff > self.config.auto_relax_max_elo_diff:
                    duration_ms = int((time.time() - start_time) * 1000)
                    return GenerationResult(
                        success=False,
                        games=[],
                        metadata={
                            "seed_used": self.seed,
                            "elo_diff_configured": self.config.elo_diff,
                            "elo_diff_used": current_elo_diff,
                            "relax_iterations": relax_iterations,
                            "attempts": attempts,
                            "duration_ms": duration_ms,
                            "constraint_toggles": {
                                "no_repeat_teammate_in_event": self.config.no_repeat_teammate_in_event,
                                "no_repeat_teammate_from_previous_event": self.config.no_repeat_teammate_from_previous_event,
                                "no_repeat_opponent_in_event": self.config.no_repeat_opponent_in_event,
                            },
                        },
                        error_message=f"Could not generate schedule within rating constraints. Max elo diff {self.config.auto_relax_max_elo_diff} exceeded.",
                    )
            else:
                # Failure due to hard constraints or auto-relax disabled
                duration_ms = int((time.time() - start_time) * 1000)
                error_msg = "Could not generate schedule with current constraints."
                if failure_reason == 'hard_constraints':
                    error_msg = "Could not generate schedule: hard constraints (teammate/opponent rules) cannot be satisfied with current settings."
                elif failure_reason == 'rating' and not self.config.auto_relax_elo_diff:
                    error_msg = f"Could not generate schedule within rating constraints (max elo diff: {current_elo_diff})."
                
                return GenerationResult(
                    success=False,
                    games=[],
                    metadata={
                        "seed_used": self.seed,
                        "elo_diff_configured": self.config.elo_diff,
                        "elo_diff_used": current_elo_diff,
                        "relax_iterations": relax_iterations,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "constraint_toggles": {
                            "no_repeat_teammate_in_event": self.config.no_repeat_teammate_in_event,
                            "no_repeat_teammate_from_previous_event": self.config.no_repeat_teammate_from_previous_event,
                            "no_repeat_opponent_in_event": self.config.no_repeat_opponent_in_event,
                        },
                    },
                    error_message=error_msg,
                )

    def _try_generate(self, elo_diff: float) -> Tuple[List[Game], bool, Optional[str]]:
        """
        Try to generate a complete schedule with given elo_diff.
        
        Uses ELO-based candidate pool generation:
        1. Generate all valid matches filtered by ELO tolerance
        2. For each round, select non-overlapping matches from the pool
        
        Returns:
            Tuple of (games, success, failure_reason)
            failure_reason is 'rating' if failure was due to rating constraints,
            'hard_constraints' if due to hard constraints, or None if successful
        """
        # Generate all valid matches filtered by ELO
        valid_matches = self._generate_all_valid_matches(elo_diff)
        
        if not valid_matches:
            return [], False, 'rating'
        
        all_games: List[Game] = []
        event_teammate_pairs: Set[FrozenSet[UUID]] = set()
        event_opponent_counts: Dict[FrozenSet[UUID], int] = {}

        for round_idx in range(self.rounds):
            round_games = self._select_round_matches(
                round_idx,
                valid_matches,
                event_teammate_pairs,
                event_opponent_counts,
            )

            if round_games is None:
                return [], False, 'hard_constraints'

            # Update tracking sets
            for game in round_games:
                event_teammate_pairs.update(game.teammate_pairs())
                # Update opponent match counts
                for pair in game.opponent_pairs():
                    event_opponent_counts[pair] = event_opponent_counts.get(pair, 0) + 1

            all_games.extend(round_games)

        return all_games, True, None

    def _generate_all_valid_matches(
        self, elo_diff: float
    ) -> List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]]:
        """
        Generate all valid matches filtered by ELO tolerance.
        
        This is the key improvement over the old algorithm:
        instead of randomly shuffling and hoping for valid combinations,
        we pre-compute all valid team pairings that satisfy ELO constraints.
        """
        from itertools import combinations
        
        # Generate all team pairs (2-player combinations)
        player_list = list(self.players.values())
        pairs = list(combinations(player_list, 2))
        
        # Generate all matches (team1 vs team2 with no player overlap)
        matches = []
        for team1 in pairs:
            for team2 in pairs:
                # No player overlap
                if {team1[0].id, team1[1].id} & {team2[0].id, team2[1].id}:
                    continue
                
                # Check ELO balance
                team1_rating = (team1[0].rating + team1[1].rating) / 2
                team2_rating = (team2[0].rating + team2[1].rating) / 2
                
                if self.checker.check_rating_balance(team1_rating, team2_rating, elo_diff):
                    matches.append((
                        (team1[0].id, team1[1].id),
                        (team2[0].id, team2[1].id)
                    ))
        
        return matches

    def _select_round_matches(
        self,
        round_idx: int,
        valid_matches: List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]],
        event_teammate_pairs: Set[FrozenSet[UUID]],
        event_opponent_counts: Dict[FrozenSet[UUID], int],
    ) -> Optional[List[Game]]:
        """
        Select non-overlapping matches for one round from the candidate pool.
        
        Args:
            round_idx: The round number
            valid_matches: Pre-computed valid matches (ELO-filtered)
            event_teammate_pairs: Teammate pairs already used in this event
            event_opponent_counts: Opponent pair counts for this event
        
        Returns:
            List of games for this round, or None if cannot fill all courts
        """
        # Try multiple times with different shuffles
        for _ in range(self.MAX_ROUND_ATTEMPTS):
            # Shuffle to get variety
            shuffled_matches = valid_matches.copy()
            random.shuffle(shuffled_matches)
            
            selected: List[Game] = []
            used_players: Set[UUID] = set()
            round_teammate_pairs: Set[FrozenSet[UUID]] = set()
            round_opponent_counts: Dict[FrozenSet[UUID], int] = {}
            
            for match in shuffled_matches:
                team1, team2 = match
                match_players = set(team1) | set(team2)
                
                # Skip if any player already used this round
                if match_players & used_players:
                    continue
                
                # Create game object
                game = Game(
                    round_index=round_idx,
                    court_index=len(selected),
                    team1=team1,
                    team2=team2,
                )
                
                # Merge event and round tracking for constraint checking
                combined_teammate_pairs = event_teammate_pairs | round_teammate_pairs
                combined_opponent_counts = {**event_opponent_counts}
                for pair, count in round_opponent_counts.items():
                    combined_opponent_counts[pair] = combined_opponent_counts.get(pair, 0) + count
                
                # Check hard constraints
                if not self._check_hard_constraints(
                    game, combined_teammate_pairs, combined_opponent_counts
                ):
                    continue
                
                # Add match
                selected.append(game)
                used_players.update(match_players)
                round_teammate_pairs.update(game.teammate_pairs())
                for pair in game.opponent_pairs():
                    round_opponent_counts[pair] = round_opponent_counts.get(pair, 0) + 1
                
                # Check if we have enough games for all courts
                if len(selected) == self.courts:
                    return selected
            
            # If we got close but not enough, try again with different shuffle
        
        return None  # Couldn't fill all courts after max attempts

    def _find_best_game(
        self,
        round_idx: int,
        court_idx: int,
        players: List[UUID],
        existing_games: List[Game],
        event_teammate_pairs: Set[FrozenSet[UUID]],
        opponent_counts: Dict[FrozenSet[UUID], int],
        elo_diff: float,
    ) -> Optional[Game]:
        """
        Find the best valid game arrangement for 4 players.
        There are 3 possible team pairings.
        """
        result, _ = self._find_best_game_with_reason(
            round_idx, court_idx, players, existing_games,
            event_teammate_pairs, opponent_counts, elo_diff
        )
        return result

    def _find_best_game_with_reason(
        self,
        round_idx: int,
        court_idx: int,
        players: List[UUID],
        existing_games: List[Game],
        event_teammate_pairs: Set[FrozenSet[UUID]],
        opponent_counts: Dict[FrozenSet[UUID], int],
        elo_diff: float,
    ) -> Tuple[Optional[Game], Optional[str]]:
        """
        Find the best valid game arrangement for 4 players.
        There are 3 possible team pairings.
        
        Returns:
            Tuple of (game, failure_reason)
            failure_reason is 'rating' if no valid game due to rating constraints,
            'hard_constraints' if due to hard constraints, or None if game found
        """
        a, b, c, d = players

        # All possible team combinations
        combinations = [
            ((a, b), (c, d)),  # AB vs CD
            ((a, c), (b, d)),  # AC vs BD
            ((a, d), (b, c)),  # AD vs BC
        ]

        best_game = None
        best_score = float("inf")
        had_hard_constraint_violations = False
        had_rating_violations = False

        for team1, team2 in combinations:
            game = Game(
                round_index=round_idx,
                court_index=court_idx,
                team1=team1,
                team2=team2,
            )

            # Check hard constraints
            if not self._check_hard_constraints(
                game, event_teammate_pairs, opponent_counts
            ):
                had_hard_constraint_violations = True
                continue

            # Check rating constraint
            team1_rating = (
                self.players[team1[0]].rating + self.players[team1[1]].rating
            ) / 2
            team2_rating = (
                self.players[team2[0]].rating + self.players[team2[1]].rating
            ) / 2

            if not self.checker.check_rating_balance(
                team1_rating, team2_rating, elo_diff
            ):
                had_rating_violations = True
                continue

            # Score this game (lower is better - prefer balanced games)
            score = abs(team1_rating - team2_rating)

            if score < best_score:
                best_score = score
                best_game = game

        # Determine failure reason if no valid game found
        if best_game is None:
            if had_rating_violations and not had_hard_constraint_violations:
                return None, 'rating'
            else:
                return None, 'hard_constraints'

        return best_game, None

    def _check_hard_constraints(
        self,
        game: Game,
        event_teammate_pairs: Set[FrozenSet[UUID]],
        opponent_counts: Dict[FrozenSet[UUID], int],
    ) -> bool:
        """Check hard constraints (teammate/opponent rules)."""
        # Check teammate constraints
        for pair in game.teammate_pairs():
            if not self.checker.check_teammate_constraint_in_event(
                pair, event_teammate_pairs
            ):
                return False
            if not self.checker.check_teammate_constraint_from_previous(pair):
                return False

        # Check opponent constraint (max 2 matches against same opponent)
        if not self.checker.check_opponent_constraint(
            game.opponent_pairs(), opponent_counts
        ):
            return False

        return True



