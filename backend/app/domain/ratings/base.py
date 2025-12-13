"""
Base rating system interface.
"""
from abc import ABC, abstractmethod
from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Tuple
from uuid import UUID


class GameResult(Enum):
    """Result of a game."""

    TEAM1_WIN = "TEAM1_WIN"
    TEAM2_WIN = "TEAM2_WIN"
    TIE = "TIE"
    UNSET = "UNSET"


@dataclass
class PlayerRating:
    """Player rating information."""

    player_id: UUID
    rating: float
    display_name: str = ""


@dataclass
class GameForRating:
    """Game data needed for rating calculation."""

    team1: Tuple[PlayerRating, PlayerRating]
    team2: Tuple[PlayerRating, PlayerRating]
    result: GameResult
    score_team1: Optional[float] = None
    score_team2: Optional[float] = None


@dataclass
class RatingDelta:
    """Rating change for a player."""

    player_id: UUID
    rating_before: float
    rating_after: float
    delta: float
    display_name: str = ""


class RatingSystem(ABC):
    """Abstract base class for rating systems."""

    def __init__(self, k_factor: float = 32, elo_const: float = 400.0):
        self.k_factor = k_factor
        self.elo_const = elo_const

    @abstractmethod
    def calculate_deltas(
        self, games: List[GameForRating], current_ratings: Dict[UUID, float]
    ) -> Dict[UUID, RatingDelta]:
        """
        Calculate rating deltas for all players based on games.

        Args:
            games: List of games to process
            current_ratings: Current ratings for all players

        Returns:
            Dict mapping player ID to their rating delta
        """
        pass

    def _get_team_average(self, p1: PlayerRating, p2: PlayerRating) -> float:
        """Get the average rating of a team."""
        return (p1.rating + p2.rating) / 2

    def _get_expected_score(self, rating_a: float, rating_b: float) -> float:
        """Calculate expected score for team A against team B using ELO formula."""
        return 1 / (1 + 10 ** ((rating_b - rating_a) / self.elo_const))

    def _get_actual_score(self, result: GameResult, is_team1: bool) -> float:
        """Get actual score (1 for win, 0 for loss, 0.5 for tie)."""
        if result == GameResult.UNSET:
            return 0.5  # Treat unset as tie for calculation purposes

        if result == GameResult.TIE:
            return 0.5
        elif result == GameResult.TEAM1_WIN:
            return 1.0 if is_team1 else 0.0
        else:  # TEAM2_WIN
            return 0.0 if is_team1 else 1.0

