"""
Serious ELO rating system.
Standard ELO calculation based on team averages.
"""
from typing import Dict, List
from uuid import UUID

from app.domain.ratings.base import (
    GameForRating,
    GameResult,
    PlayerRating,
    RatingDelta,
    RatingSystem,
)


class SeriousEloRating(RatingSystem):
    """
    Standard ELO rating system for competitive play.

    Team rating is the average of both players.
    Each player on a team receives the same delta.
    """

    def __init__(self, k_factor: float = 32, elo_const: float = 400.0):
        super().__init__(k_factor=k_factor, elo_const=elo_const)

    def calculate_deltas(
        self, games: List[GameForRating], current_ratings: Dict[UUID, float]
    ) -> Dict[UUID, RatingDelta]:
        """Calculate rating deltas using standard ELO formula."""
        # Track cumulative deltas for each player
        player_deltas: Dict[UUID, float] = {}
        player_info: Dict[UUID, PlayerRating] = {}

        for game in games:
            if game.result == GameResult.UNSET:
                continue  # Skip games without scores

            # Store player info
            for p in [*game.team1, *game.team2]:
                if p.player_id not in player_info:
                    player_info[p.player_id] = p
                    player_deltas[p.player_id] = 0.0

            # Calculate team averages
            team1_rating = self._get_team_average(game.team1[0], game.team1[1])
            team2_rating = self._get_team_average(game.team2[0], game.team2[1])

            # Calculate expected scores
            expected_team1 = self._get_expected_score(team1_rating, team2_rating)

            # Get actual scores
            actual_team1 = self._get_actual_score(game.result, is_team1=True)

            # Calculate delta
            delta_team1 = self.k_factor * (actual_team1 - expected_team1)
            delta_team2 = -delta_team1

            # Apply delta to each player
            for p in game.team1:
                player_deltas[p.player_id] += delta_team1

            for p in game.team2:
                player_deltas[p.player_id] += delta_team2

        # Build result
        result: Dict[UUID, RatingDelta] = {}
        for player_id, delta in player_deltas.items():
            rating_before = current_ratings.get(
                player_id, player_info[player_id].rating
            )
            result[player_id] = RatingDelta(
                player_id=player_id,
                rating_before=rating_before,
                rating_after=rating_before + delta,
                delta=delta,
                display_name=player_info[player_id].display_name,
            )

        return result







