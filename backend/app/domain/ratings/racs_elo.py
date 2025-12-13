"""
Rac's ELO rating system.
Based on calculate_elo.py from sportify_logic.

Key differences from standard ELO:
1. Individual player expected scores (each player vs opponent team average)
2. K-factor based on score difference: K = 10 × |score_diff|
3. elo_const = 0.3 for expected result sensitivity
"""
from typing import Dict, List, Optional
from uuid import UUID

from app.domain.ratings.base import (
    GameForRating,
    GameResult,
    PlayerRating,
    RatingDelta,
    RatingSystem,
)


class RacsEloRating(RatingSystem):
    """
    Rac's ELO rating system - "Fun" ELO with volatile ratings.

    Each player has their own expected score calculated against the
    opponent team's average rating. K-factor scales with score difference,
    making blowout wins/losses more impactful.
    """

    def __init__(self, k_factor: float = 100, elo_const: float = 0.3):
        super().__init__(k_factor=k_factor, elo_const=elo_const)

    def calculate_deltas(
        self, games: List[GameForRating], current_ratings: Dict[UUID, float]
    ) -> Dict[UUID, RatingDelta]:
        """Calculate rating deltas using Rac's ELO formula."""
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

            # Get players and their ratings
            p1, p2 = game.team1
            p3, p4 = game.team2

            # Calculate team averages
            team1_avg = self._get_team_average(p1, p2)
            team2_avg = self._get_team_average(p3, p4)

            # Calculate individual expected scores
            # E = 1 / (1 + 10^((player_elo - opponent_team_avg) / (player_elo * elo_const)))
            E1 = self._calc_expected(p1.rating, team2_avg)
            E2 = self._calc_expected(p2.rating, team2_avg)
            E3 = self._calc_expected(p3.rating, team1_avg)
            E4 = self._calc_expected(p4.rating, team1_avg)

            # K-factor = 10 * |score_diff| (exactly like calculate_elo.py line 43)
            if game.score_team1 is not None and game.score_team2 is not None:
                score_diff = abs(game.score_team1 - game.score_team2)
                k_const = 10 * score_diff
            else:
                # Fallback if scores not available
                k_const = self.k_factor

            # Calculate deltas based on result
            if game.result == GameResult.TEAM1_WIN:
                # Team 1 wins
                player_deltas[p1.player_id] += k_const * E1
                player_deltas[p2.player_id] += k_const * E2
                player_deltas[p3.player_id] += k_const * (-1 + E3)
                player_deltas[p4.player_id] += k_const * (-1 + E4)

            elif game.result == GameResult.TEAM2_WIN:
                # Team 2 wins
                player_deltas[p1.player_id] += k_const * (-1 + E1)
                player_deltas[p2.player_id] += k_const * (-1 + E2)
                player_deltas[p3.player_id] += k_const * E3
                player_deltas[p4.player_id] += k_const * E4

            else:  # TIE
                # No ELO change on tie in Rac's system
                pass

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

    def _calc_expected(self, player_rating: float, opponent_team_avg: float) -> float:
        """
        Calculate individual expected score using Rac's formula.

        E = 1 / (1 + 10^((player_elo - opponent_avg) / (player_elo * elo_const)))
        """
        if player_rating == 0:
            return 0.5
        
        exponent = (player_rating - opponent_team_avg) / (player_rating * self.elo_const)
        return 1.0 / (1.0 + pow(10.0, exponent))
