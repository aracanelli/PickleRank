"""
Catch-Up ELO rating system.
A fun mode that compresses rating spread over time.
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


class CatchUpEloRating(RatingSystem):
    """
    Catch-Up ELO rating system for more casual play.

    Modifies standard ELO to:
    - Increase gains for players below median (up to +50%)
    - Reduce gains for players above median (up to -30%)
    - Slightly harsher losses for above-median players (up to +20%)

    This compresses the rating spread over time, making it more fun for casual groups.
    """

    def __init__(self, k_factor: float = 32, elo_const: float = 400.0):
        super().__init__(k_factor=k_factor, elo_const=elo_const)
        self.gain_boost_max = 0.50  # Max boost for below-median winners
        self.gain_reduction_max = 0.30  # Max reduction for above-median winners
        self.loss_penalty_max = 0.20  # Max extra loss for above-median losers

    def calculate_deltas(
        self, games: List[GameForRating], current_ratings: Dict[UUID, float]
    ) -> Dict[UUID, RatingDelta]:
        """Calculate rating deltas with catch-up adjustments."""
        # Track cumulative deltas for each player
        player_deltas: Dict[UUID, float] = {}
        player_info: Dict[UUID, PlayerRating] = {}

        # First pass: collect all players and their ratings
        all_players = set()
        for game in games:
            for p in [*game.team1, *game.team2]:
                all_players.add(p.player_id)
                if p.player_id not in player_info:
                    player_info[p.player_id] = p
                    player_deltas[p.player_id] = 0.0

        # Calculate median rating
        ratings = [
            current_ratings.get(pid, player_info[pid].rating) for pid in all_players
        ]
        sorted_ratings = sorted(ratings)
        n = len(sorted_ratings)
        if n == 0:
            median_rating = 1000.0
        elif n % 2 == 0:
            median_rating = (sorted_ratings[n // 2 - 1] + sorted_ratings[n // 2]) / 2
        else:
            median_rating = sorted_ratings[n // 2]

        # Process each game
        for game in games:
            if game.result == GameResult.UNSET:
                continue

            # Calculate base ELO delta (same as serious ELO)
            team1_rating = self._get_team_average(game.team1[0], game.team1[1])
            team2_rating = self._get_team_average(game.team2[0], game.team2[1])

            expected_team1 = self._get_expected_score(team1_rating, team2_rating)
            actual_team1 = self._get_actual_score(game.result, is_team1=True)

            base_delta_team1 = self.k_factor * (actual_team1 - expected_team1)

            # Apply catch-up adjustments per player
            for p in game.team1:
                adjusted_delta = self._adjust_delta(
                    base_delta_team1,
                    current_ratings.get(p.player_id, p.rating),
                    median_rating,
                )
                player_deltas[p.player_id] += adjusted_delta

            for p in game.team2:
                base_delta = -base_delta_team1
                adjusted_delta = self._adjust_delta(
                    base_delta,
                    current_ratings.get(p.player_id, p.rating),
                    median_rating,
                )
                player_deltas[p.player_id] += adjusted_delta

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

    def _adjust_delta(
        self, base_delta: float, player_rating: float, median_rating: float
    ) -> float:
        """
        Adjust the delta based on player's position relative to median.

        Below median: boost gains, normal losses
        Above median: reduce gains, harsher losses
        """
        if median_rating == 0:
            return base_delta

        # Calculate how far from median (as a ratio)
        distance_ratio = (player_rating - median_rating) / median_rating
        distance_ratio = max(-0.5, min(0.5, distance_ratio))  # Clamp to reasonable range

        if base_delta > 0:  # This is a gain
            if player_rating < median_rating:
                # Below median: boost gains
                boost = self.gain_boost_max * abs(distance_ratio) * 2
                return base_delta * (1 + boost)
            else:
                # Above median: reduce gains
                reduction = self.gain_reduction_max * abs(distance_ratio) * 2
                return base_delta * (1 - reduction)
        else:  # This is a loss
            if player_rating > median_rating:
                # Above median: harsher losses
                penalty = self.loss_penalty_max * abs(distance_ratio) * 2
                return base_delta * (1 + penalty)
            else:
                # Below median: normal losses
                return base_delta







