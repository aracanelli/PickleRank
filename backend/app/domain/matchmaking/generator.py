"""
Match schedule generator with constraint satisfaction.

Supports 2v2, 2v1, and 1v1 court configurations.
- Standard: courts * 4 players → all courts 2v2
- One short: courts * 4 - 1 players → (courts-1) courts 2v2 + 1 court 2v1
- Two short: courts * 4 - 2 players → (courts-1) courts 2v2 + 1 court 1v1
"""
import hashlib
import random
import time
from dataclasses import dataclass
from itertools import combinations
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
    """Generates match schedules satisfying constraints.

    Supports flexible player counts:
    - courts * 4 players: all 2v2
    - courts * 4 - 1: one court plays 2v1 (fair: strongest player solo)
    - courts * 4 - 2: one court plays 1v1
    """

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
        num_players = len(players)
        max_players = courts * 4
        min_players = courts * 4 - 2

        if num_players < min_players or num_players > max_players:
            raise ValueError(
                f"Number of players ({num_players}) must be between "
                f"{min_players} and {max_players} for {courts} courts"
            )

        self.players = {p.id: p for p in players}
        self.player_ids = [p.id for p in players]
        self.courts = courts
        self.rounds = rounds
        self.config = config
        self.checker = ConstraintChecker(config, previous_teammate_pairs)
        self.seed = seed or self._generate_seed()

        # Determine court configuration
        self.shortfall = max_players - num_players  # 0, 1, or 2
        if self.shortfall == 0:
            self.mode = "standard"        # all 2v2
            self.standard_courts = courts
        elif self.shortfall == 1:
            self.mode = "one_short"       # one 2v1 court
            self.standard_courts = courts - 1
        else:
            self.mode = "two_short"       # one 1v1 court
            self.standard_courts = courts - 1

    def _generate_seed(self) -> str:
        """Generate a random seed."""
        return hashlib.sha256(str(time.time()).encode()).hexdigest()[:12]

    # Maximum seed retries for hard constraint failures before giving up
    MAX_SEED_RETRIES = 3

    def generate(self) -> GenerationResult:
        """
        Generate a complete schedule.

        Uses iterative relaxation if rating constraint cannot be satisfied.
        Also retries with different seeds for hard constraint failures.
        """
        start_time = time.time()
        attempts = 0
        relax_iterations = 0
        seed_retries = 0
        current_elo_diff = self.config.elo_diff

        while True:
            # Set seed for reproducibility, incorporating retry count for variety
            random.seed(f"{self.seed}_{relax_iterations}_{seed_retries}")

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
                        "seed_retries": seed_retries,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "court_mode": self.mode,
                        "constraint_toggles": {
                            "no_repeat_teammate_in_event": self.config.no_repeat_teammate_in_event,
                            "no_repeat_teammate_from_previous_event": self.config.no_repeat_teammate_from_previous_event,
                            "no_repeat_opponent_in_event": self.config.no_repeat_opponent_in_event,
                        },
                    },
                )

            # Only relax elo_diff if failure was due to rating constraints
            if self.config.auto_relax_elo_diff and failure_reason == 'rating':
                current_elo_diff += self.config.auto_relax_step
                relax_iterations += 1
                seed_retries = 0

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
                            "seed_retries": seed_retries,
                            "attempts": attempts,
                            "duration_ms": duration_ms,
                            "court_mode": self.mode,
                            "constraint_toggles": {
                                "no_repeat_teammate_in_event": self.config.no_repeat_teammate_in_event,
                                "no_repeat_teammate_from_previous_event": self.config.no_repeat_teammate_from_previous_event,
                                "no_repeat_opponent_in_event": self.config.no_repeat_opponent_in_event,
                            },
                        },
                        error_message=f"Could not generate schedule within rating constraints. Max elo diff {self.config.auto_relax_max_elo_diff} exceeded.",
                    )
            elif failure_reason == 'hard_constraints' and seed_retries < self.MAX_SEED_RETRIES:
                seed_retries += 1
                continue
            else:
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
                        "seed_retries": seed_retries,
                        "attempts": attempts,
                        "duration_ms": duration_ms,
                        "court_mode": self.mode,
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

        For standard mode: uses ELO-filtered 2v2 match pool.
        For one_short/two_short: generates mixed match types per round.
        """
        if self.mode == "standard":
            return self._try_generate_standard(elo_diff)
        else:
            return self._try_generate_flexible(elo_diff)

    # ──────────────────────────────────────────────
    # Standard 2v2 generation (original algorithm)
    # ──────────────────────────────────────────────

    def _try_generate_standard(self, elo_diff: float) -> Tuple[List[Game], bool, Optional[str]]:
        """Generate all-2v2 schedule (original algorithm)."""
        valid_matches = self._generate_all_valid_2v2_matches(elo_diff)

        if not valid_matches:
            return [], False, 'rating'

        if not self._has_sufficient_match_pool(valid_matches, self.courts, 4):
            return [], False, 'rating'

        all_games: List[Game] = []
        event_teammate_pairs: Set[FrozenSet[UUID]] = set()
        event_opponent_counts: Dict[FrozenSet[UUID], int] = {}

        for round_idx in range(self.rounds):
            round_games, failure_type = self._select_round_matches(
                round_idx,
                valid_matches,
                event_teammate_pairs,
                event_opponent_counts,
                self.courts,
            )

            if round_games is None:
                return [], False, failure_type

            for game in round_games:
                event_teammate_pairs.update(game.teammate_pairs())
                for pair in game.opponent_pairs():
                    event_opponent_counts[pair] = event_opponent_counts.get(pair, 0) + 1

            all_games.extend(round_games)

        return all_games, True, None

    # ──────────────────────────────────────────────
    # Flexible generation (2v2 + 2v1 or 2v2 + 1v1)
    # ──────────────────────────────────────────────

    def _try_generate_flexible(self, elo_diff: float) -> Tuple[List[Game], bool, Optional[str]]:
        """
        Generate schedule with mixed match types.

        Strategy per round:
        1. Select players for the non-standard court (2v1 or 1v1)
        2. Generate the non-standard match with fair assignment
        3. Generate 2v2 matches for remaining players on remaining courts
        4. Rotate which players are on the non-standard court across rounds
        """
        # Pre-generate all valid 2v2 matches
        valid_2v2 = self._generate_all_valid_2v2_matches(elo_diff)

        if self.standard_courts > 0 and not valid_2v2:
            return [], False, 'rating'

        all_games: List[Game] = []
        event_teammate_pairs: Set[FrozenSet[UUID]] = set()
        event_opponent_counts: Dict[FrozenSet[UUID], int] = {}

        # Track how many times each player has been on the non-standard court
        # to ensure fair rotation
        non_standard_counts: Dict[UUID, int] = {pid: 0 for pid in self.player_ids}

        for round_idx in range(self.rounds):
            round_result = self._generate_flexible_round(
                round_idx,
                elo_diff,
                valid_2v2,
                event_teammate_pairs,
                event_opponent_counts,
                non_standard_counts,
            )

            if round_result is None:
                # Try to determine failure reason
                if not valid_2v2 and self.standard_courts > 0:
                    return [], False, 'rating'
                return [], False, 'hard_constraints'

            for game in round_result:
                event_teammate_pairs.update(game.teammate_pairs())
                for pair in game.opponent_pairs():
                    event_opponent_counts[pair] = event_opponent_counts.get(pair, 0) + 1

            all_games.extend(round_result)

        return all_games, True, None

    def _generate_flexible_round(
        self,
        round_idx: int,
        elo_diff: float,
        valid_2v2: List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]],
        event_teammate_pairs: Set[FrozenSet[UUID]],
        event_opponent_counts: Dict[FrozenSet[UUID], int],
        non_standard_counts: Dict[UUID, int],
    ) -> Optional[List[Game]]:
        """
        Generate one round with a mix of standard and non-standard courts.

        Returns list of games for the round, or None on failure.
        """
        player_list = list(self.players.values())
        num_non_standard_players = 3 if self.mode == "one_short" else 2

        # Generate candidate groups for the non-standard court
        # Sort players by how often they've been on the non-standard court (least first)
        # to ensure fair rotation
        candidates = self._get_non_standard_candidates(
            player_list, num_non_standard_players, non_standard_counts
        )

        # Try each candidate group
        for ns_players in candidates:
            ns_player_ids = {p.id for p in ns_players}
            remaining_player_ids = [pid for pid in self.player_ids if pid not in ns_player_ids]

            # Create the non-standard game
            ns_game = self._create_non_standard_game(
                round_idx, self.standard_courts, ns_players, elo_diff
            )
            if ns_game is None:
                continue  # ELO balance check failed for this group

            # Check hard constraints for the non-standard game
            if not self._check_hard_constraints(ns_game, event_teammate_pairs, event_opponent_counts):
                continue

            # Now try to fill the remaining courts with 2v2 matches
            # Filter valid_2v2 to only include matches using remaining players
            remaining_set = set(remaining_player_ids)
            filtered_2v2 = [
                m for m in valid_2v2
                if set(m[0]) | set(m[1]) <= remaining_set
            ]

            if self.standard_courts == 0:
                # Only the non-standard court
                for p in ns_players:
                    non_standard_counts[p.id] = non_standard_counts.get(p.id, 0) + 1
                return [ns_game]

            if not filtered_2v2:
                continue

            # Use backtracking to fill remaining courts with 2v2
            # Include the non-standard game's constraint contributions
            combined_teammate_pairs = event_teammate_pairs | ns_game.teammate_pairs()
            combined_opponent_counts = dict(event_opponent_counts)
            for pair in ns_game.opponent_pairs():
                combined_opponent_counts[pair] = combined_opponent_counts.get(pair, 0) + 1

            standard_games, failure_type = self._select_round_matches(
                round_idx,
                filtered_2v2,
                combined_teammate_pairs,
                combined_opponent_counts,
                self.standard_courts,
            )

            if standard_games is not None:
                # Success! Update rotation counts
                for p in ns_players:
                    non_standard_counts[p.id] = non_standard_counts.get(p.id, 0) + 1
                return [ns_game] + standard_games

        return None

    def _get_non_standard_candidates(
        self,
        players: List[Player],
        group_size: int,
        non_standard_counts: Dict[UUID, int],
    ) -> List[List[Player]]:
        """
        Generate candidate player groups for the non-standard court.

        Prioritizes players who have been on the non-standard court least often,
        to ensure fair rotation across rounds.
        """
        # Sort players by non-standard count (ascending) then shuffle within same count
        sorted_players = sorted(players, key=lambda p: (non_standard_counts.get(p.id, 0), random.random()))

        # Generate combinations, prioritizing groups of least-used players
        all_combos = list(combinations(sorted_players, group_size))

        # Score each combo by total non-standard usage (prefer lower)
        def combo_score(combo):
            return sum(non_standard_counts.get(p.id, 0) for p in combo)

        all_combos.sort(key=combo_score)

        # Shuffle combos with the same score for variety
        result = []
        i = 0
        while i < len(all_combos):
            j = i
            score = combo_score(all_combos[i])
            while j < len(all_combos) and combo_score(all_combos[j]) == score:
                j += 1
            group = list(all_combos[i:j])
            random.shuffle(group)
            result.extend(group)
            i = j

        return [list(c) for c in result]

    def _create_non_standard_game(
        self,
        round_idx: int,
        court_idx: int,
        players: List[Player],
        elo_diff: float,
    ) -> Optional[Game]:
        """
        Create a 2v1 or 1v1 game with fair player assignment.

        For 2v1: The highest-rated player plays solo against the two
        lower-rated players. This is the fairest arrangement because
        the stronger player can better handle the court alone.

        For 1v1: Higher-rated player on team1, lower on team2.
        """
        if len(players) == 3:
            # 2v1: Sort by rating descending — highest goes solo
            sorted_players = sorted(players, key=lambda p: p.rating, reverse=True)
            solo_player = sorted_players[0]
            duo_players = sorted_players[1:]

            # Duo is team1, solo is team2
            team1 = (duo_players[0].id, duo_players[1].id)
            team2 = (solo_player.id, None)

            # Check ELO balance: duo average vs solo rating
            duo_avg = (duo_players[0].rating + duo_players[1].rating) / 2
            solo_rating = solo_player.rating

            if not self.checker.check_rating_balance(duo_avg, solo_rating, elo_diff):
                return None

            return Game(
                round_index=round_idx,
                court_index=court_idx,
                team1=team1,
                team2=team2,
                game_type="2v1",
            )

        elif len(players) == 2:
            # 1v1: Higher rated as team1 for consistency
            sorted_players = sorted(players, key=lambda p: p.rating, reverse=True)

            team1 = (sorted_players[0].id, None)
            team2 = (sorted_players[1].id, None)

            if not self.checker.check_rating_balance(
                sorted_players[0].rating, sorted_players[1].rating, elo_diff
            ):
                return None

            return Game(
                round_index=round_idx,
                court_index=court_idx,
                team1=team1,
                team2=team2,
                game_type="1v1",
            )

        return None

    # ──────────────────────────────────────────────
    # 2v2 match generation and selection
    # ──────────────────────────────────────────────

    def _has_sufficient_match_pool(
        self,
        matches: List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]],
        target_courts: int,
        players_per_match: int,
    ) -> bool:
        """Check if the match pool is theoretically sufficient."""
        used_players: Set[UUID] = set()
        count = 0

        for match in matches:
            team1, team2 = match
            match_players = set(team1) | set(team2)

            if not (match_players & used_players):
                used_players.update(match_players)
                count += 1

                if count >= target_courts:
                    return True

        return False

    def _generate_all_valid_2v2_matches(
        self, elo_diff: float
    ) -> List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]]:
        """
        Generate all valid 2v2 matches filtered by ELO tolerance.
        """
        player_list = list(self.players.values())
        pairs = list(combinations(player_list, 2))

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
        target_courts: int,
    ) -> Tuple[Optional[List[Game]], str]:
        """
        Select non-overlapping 2v2 matches for a round using backtracking.
        """
        shuffled_matches = valid_matches.copy()
        random.shuffle(shuffled_matches)

        matches_rejected_for_hard_constraints = 0

        # Pre-filter matches that pass hard constraints
        eligible_matches = []
        for match in shuffled_matches:
            team1, team2 = match
            game = Game(
                round_index=round_idx,
                court_index=0,
                team1=team1,
                team2=team2,
            )

            if self._check_hard_constraints(game, event_teammate_pairs, event_opponent_counts):
                eligible_matches.append(match)
            else:
                matches_rejected_for_hard_constraints += 1

        if len(eligible_matches) < target_courts:
            if matches_rejected_for_hard_constraints > 0 and len(valid_matches) >= target_courts:
                return None, 'hard_constraints'
            else:
                return None, 'rating'

        result = self._backtrack_select_matches(
            round_idx=round_idx,
            matches=eligible_matches,
            match_idx=0,
            selected=[],
            used_players=set(),
            round_teammate_pairs=set(),
            round_opponent_counts={},
            event_teammate_pairs=event_teammate_pairs,
            event_opponent_counts=event_opponent_counts,
            target_courts=target_courts,
        )

        if result is not None:
            return result, 'success'

        if len(eligible_matches) < len(self.players) // 2:
            return None, 'rating'
        else:
            return None, 'hard_constraints'

    def _backtrack_select_matches(
        self,
        round_idx: int,
        matches: List[Tuple[Tuple[UUID, UUID], Tuple[UUID, UUID]]],
        match_idx: int,
        selected: List[Game],
        used_players: Set[UUID],
        round_teammate_pairs: Set[FrozenSet[UUID]],
        round_opponent_counts: Dict[FrozenSet[UUID], int],
        event_teammate_pairs: Set[FrozenSet[UUID]],
        event_opponent_counts: Dict[FrozenSet[UUID], int],
        target_courts: int,
    ) -> Optional[List[Game]]:
        """
        Backtracking algorithm to find non-overlapping matches that fill all courts.
        """
        if len(selected) == target_courts:
            return selected.copy()

        remaining_courts = target_courts - len(selected)
        remaining_matches = len(matches) - match_idx
        if remaining_matches < remaining_courts:
            return None

        for i in range(match_idx, len(matches)):
            match = matches[i]
            team1, team2 = match
            match_players = set(team1) | set(team2)

            if match_players & used_players:
                continue

            game = Game(
                round_index=round_idx,
                court_index=len(selected),
                team1=team1,
                team2=team2,
            )

            combined_teammate_pairs = event_teammate_pairs | round_teammate_pairs
            combined_opponent_counts = {**event_opponent_counts}
            for pair, count in round_opponent_counts.items():
                combined_opponent_counts[pair] = combined_opponent_counts.get(pair, 0) + count

            if not self._check_hard_constraints(game, combined_teammate_pairs, combined_opponent_counts):
                continue

            new_used_players = used_players | match_players
            new_teammate_pairs = round_teammate_pairs | game.teammate_pairs()
            new_opponent_counts = round_opponent_counts.copy()
            for pair in game.opponent_pairs():
                new_opponent_counts[pair] = new_opponent_counts.get(pair, 0) + 1

            result = self._backtrack_select_matches(
                round_idx=round_idx,
                matches=matches,
                match_idx=i + 1,
                selected=selected + [game],
                used_players=new_used_players,
                round_teammate_pairs=new_teammate_pairs,
                round_opponent_counts=new_opponent_counts,
                event_teammate_pairs=event_teammate_pairs,
                event_opponent_counts=event_opponent_counts,
                target_courts=target_courts,
            )

            if result is not None:
                return result

        return None

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
        """
        a, b, c, d = players

        combinations_list = [
            ((a, b), (c, d)),
            ((a, c), (b, d)),
            ((a, d), (b, c)),
        ]

        best_game = None
        best_score = float("inf")
        had_hard_constraint_violations = False
        had_rating_violations = False

        for team1, team2 in combinations_list:
            game = Game(
                round_index=round_idx,
                court_index=court_idx,
                team1=team1,
                team2=team2,
            )

            if not self._check_hard_constraints(
                game, event_teammate_pairs, opponent_counts
            ):
                had_hard_constraint_violations = True
                continue

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

            score = abs(team1_rating - team2_rating)

            if score < best_score:
                best_score = score
                best_game = game

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
        for pair in game.teammate_pairs():
            if not self.checker.check_teammate_constraint_in_event(
                pair, event_teammate_pairs
            ):
                return False
            if not self.checker.check_teammate_constraint_from_previous(pair):
                return False

        if not self.checker.check_opponent_constraint(
            game.opponent_pairs(), opponent_counts
        ):
            return False

        return True
