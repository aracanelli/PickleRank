"""
Matchmaking constraints for pickleball events.
"""
from dataclasses import dataclass, field
from typing import Dict, FrozenSet, List, Optional, Set, Tuple
from uuid import UUID


@dataclass
class ConstraintConfig:
    """Configuration for matchmaking constraints."""

    no_repeat_teammate_in_event: bool = True
    no_repeat_teammate_from_previous_event: bool = True
    no_repeat_opponent_in_event: bool = True
    elo_diff: float = 0.05
    auto_relax_elo_diff: bool = True
    auto_relax_step: float = 0.01
    auto_relax_max_elo_diff: float = 0.25


@dataclass
class Player:
    """Player with rating for matchmaking."""

    id: UUID
    rating: float
    display_name: str = ""


@dataclass
class Game:
    """A game that can be 2v2, 2v1, or 1v1.

    For 2v2: team1 = (p1, p2), team2 = (p3, p4)
    For 2v1: team1 = (p1, p2), team2 = (p3, None) — duo vs solo
    For 1v1: team1 = (p1, None), team2 = (p3, None)
    """

    round_index: int
    court_index: int
    team1: Tuple[UUID, Optional[UUID]]
    team2: Tuple[UUID, Optional[UUID]]
    game_type: str = "2v2"  # "2v2", "2v1", "1v1"

    def all_players(self) -> Set[UUID]:
        """Get all players in this game."""
        players = {self.team1[0], self.team2[0]}
        if self.team1[1] is not None:
            players.add(self.team1[1])
        if self.team2[1] is not None:
            players.add(self.team2[1])
        return players

    def teammate_pairs(self) -> Set[FrozenSet[UUID]]:
        """Get teammate pairs as frozen sets. Only pairs where both exist."""
        pairs: Set[FrozenSet[UUID]] = set()
        if self.team1[1] is not None:
            pairs.add(frozenset([self.team1[0], self.team1[1]]))
        if self.team2[1] is not None:
            pairs.add(frozenset([self.team2[0], self.team2[1]]))
        return pairs

    def opponent_pairs(self) -> Set[FrozenSet[UUID]]:
        """Get opponent pairs as frozen sets."""
        t1_players = [self.team1[0]]
        if self.team1[1] is not None:
            t1_players.append(self.team1[1])
        t2_players = [self.team2[0]]
        if self.team2[1] is not None:
            t2_players.append(self.team2[1])
        pairs: Set[FrozenSet[UUID]] = set()
        for p1 in t1_players:
            for p2 in t2_players:
                pairs.add(frozenset([p1, p2]))
        return pairs

    def team_size(self, team: int) -> int:
        """Get the size of a team (1 or 2)."""
        t = self.team1 if team == 1 else self.team2
        return 2 if t[1] is not None else 1


class ConstraintChecker:
    """Validates matchmaking constraints."""

    def __init__(
        self,
        config: ConstraintConfig,
        previous_teammate_pairs: Set[FrozenSet[UUID]] = None,
    ):
        self.config = config
        self.previous_teammate_pairs = previous_teammate_pairs or set()

    def check_teammate_constraint_in_event(
        self, new_pair: FrozenSet[UUID], existing_pairs: Set[FrozenSet[UUID]]
    ) -> bool:
        """Check if a new teammate pair violates the no-repeat-teammate-in-event constraint."""
        if not self.config.no_repeat_teammate_in_event:
            return True
        return new_pair not in existing_pairs

    def check_teammate_constraint_from_previous(
        self, new_pair: FrozenSet[UUID]
    ) -> bool:
        """Check if a new teammate pair violates the no-repeat-from-previous-event constraint."""
        if not self.config.no_repeat_teammate_from_previous_event:
            return True
        return new_pair not in self.previous_teammate_pairs

    def check_opponent_constraint(
        self, new_pairs: Set[FrozenSet[UUID]], opponent_counts: Dict[FrozenSet[UUID], int]
    ) -> bool:
        """
        Check if opponent pairs violate the opponent constraint.
        Allows up to 2 matches against the same opponent in one event.
        """
        if not self.config.no_repeat_opponent_in_event:
            return True
        # Check if any opponent pair would exceed 2 matches
        for pair in new_pairs:
            current_count = opponent_counts.get(pair, 0)
            if current_count >= 2:
                return False
        return True

    def check_rating_balance(
        self, team1_rating: float, team2_rating: float, elo_diff: float
    ) -> bool:
        """Check if two teams are balanced within the rating difference threshold."""
        max_rating = max(team1_rating, team2_rating)
        if max_rating == 0:
            return True
        diff = abs(team1_rating - team2_rating) / max_rating
        return diff <= elo_diff

    def validate_game(
        self,
        game: Game,
        existing_games: List[Game],
        players: Dict[UUID, Player],
        elo_diff: float,
    ) -> Tuple[bool, List[str]]:
        """
        Validate a game against all constraints.

        Returns:
            Tuple of (is_valid, list of violation messages)
        """
        violations = []

        # Get existing pairs from this event
        existing_teammates = set()
        opponent_counts: Dict[FrozenSet[UUID], int] = {}
        for g in existing_games:
            existing_teammates.update(g.teammate_pairs())
            for pair in g.opponent_pairs():
                opponent_counts[pair] = opponent_counts.get(pair, 0) + 1

        # Check teammate constraints
        for pair in game.teammate_pairs():
            if not self.check_teammate_constraint_in_event(pair, existing_teammates):
                violations.append(f"Repeated teammate pair in event")
            if not self.check_teammate_constraint_from_previous(pair):
                violations.append(f"Repeated teammate pair from previous event")

        # Check opponent constraint (max 2 matches against same opponent)
        if not self.check_opponent_constraint(game.opponent_pairs(), opponent_counts):
            violations.append(f"Opponent pair would exceed 2 matches in event")

        # Check rating balance
        team1_rating = self._get_team_rating(game.team1, players)
        team2_rating = self._get_team_rating(game.team2, players)

        if not self.check_rating_balance(team1_rating, team2_rating, elo_diff):
            violations.append(
                f"Rating imbalance: {team1_rating:.0f} vs {team2_rating:.0f}"
            )

        return len(violations) == 0, violations

    def _get_team_rating(
        self, team: Tuple[UUID, Optional[UUID]], players: Dict[UUID, Player]
    ) -> float:
        """Get the average rating of a team, handling 1-player teams."""
        if team[1] is None:
            return players[team[0]].rating
        return (players[team[0]].rating + players[team[1]].rating) / 2

    def check_swap_warnings(
        self,
        game_after_swap: Game,
        all_games: List[Game],
    ) -> List[str]:
        """
        Check for warnings after a swap (doesn't block but warns user).
        """
        warnings = []

        # Get all teammate pairs from the event
        existing_teammates = set()
        for g in all_games:
            if g != game_after_swap:
                existing_teammates.update(g.teammate_pairs())

        # Check teammate from previous event
        for pair in game_after_swap.teammate_pairs():
            if not self.check_teammate_constraint_from_previous(pair):
                warnings.append("Swap creates teammate repeat from previous event")
                break

        return warnings
