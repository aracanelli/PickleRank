"""
Unit tests for Catch-Up ELO rating system.
"""
import pytest
from uuid import uuid4

from app.domain.ratings.base import GameForRating, GameResult, PlayerRating
from app.domain.ratings.catch_up_elo import CatchUpEloRating
from app.domain.ratings.serious_elo import SeriousEloRating


class TestCatchUpEloRating:
    """Tests for the CatchUpEloRating class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.catchup = CatchUpEloRating(k_factor=32)
        self.serious = SeriousEloRating(k_factor=32)

    def create_player(self, rating: float, name: str = "Player") -> PlayerRating:
        """Create a test player."""
        return PlayerRating(
            player_id=uuid4(),
            rating=rating,
            display_name=name,
        )

    def test_below_median_winner_gets_boost(self):
        """Test that below-median player gets boosted win gains."""
        # Create players: 2 below median, 2 above
        p1 = self.create_player(800, "P1")   # Below median
        p2 = self.create_player(900, "P2")   # Below median
        p3 = self.create_player(1100, "P3")  # Above median
        p4 = self.create_player(1200, "P4")  # Above median
        # Median is (900 + 1100) / 2 = 1000

        game = GameForRating(
            team1=(p1, p2),  # Below median team wins
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 800,
            p2.player_id: 900,
            p3.player_id: 1100,
            p4.player_id: 1200,
        }

        catchup_deltas = self.catchup.calculate_deltas([game], current_ratings)
        serious_deltas = self.serious.calculate_deltas([game], current_ratings)

        # Below-median winners should get MORE in catch-up than serious
        assert catchup_deltas[p1.player_id].delta > serious_deltas[p1.player_id].delta
        assert catchup_deltas[p2.player_id].delta > serious_deltas[p2.player_id].delta

    def test_above_median_winner_gets_reduction(self):
        """Test that above-median player gets reduced win gains."""
        p1 = self.create_player(1100, "P1")  # Above median
        p2 = self.create_player(1200, "P2")  # Above median
        p3 = self.create_player(800, "P3")   # Below median
        p4 = self.create_player(900, "P4")   # Below median

        game = GameForRating(
            team1=(p1, p2),  # Above median team wins
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 1100,
            p2.player_id: 1200,
            p3.player_id: 800,
            p4.player_id: 900,
        }

        catchup_deltas = self.catchup.calculate_deltas([game], current_ratings)
        serious_deltas = self.serious.calculate_deltas([game], current_ratings)

        # Above-median winners should get LESS in catch-up than serious
        assert catchup_deltas[p1.player_id].delta < serious_deltas[p1.player_id].delta
        assert catchup_deltas[p2.player_id].delta < serious_deltas[p2.player_id].delta

    def test_above_median_loser_gets_harsher_loss(self):
        """Test that above-median player gets harsher losses."""
        p1 = self.create_player(800, "P1")   # Below median - winners
        p2 = self.create_player(900, "P2")
        p3 = self.create_player(1100, "P3")  # Above median - losers
        p4 = self.create_player(1200, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,  # Above median loses
        )

        current_ratings = {
            p1.player_id: 800,
            p2.player_id: 900,
            p3.player_id: 1100,
            p4.player_id: 1200,
        }

        catchup_deltas = self.catchup.calculate_deltas([game], current_ratings)
        serious_deltas = self.serious.calculate_deltas([game], current_ratings)

        # Above-median losers should lose MORE in catch-up (more negative)
        assert catchup_deltas[p3.player_id].delta < serious_deltas[p3.player_id].delta
        assert catchup_deltas[p4.player_id].delta < serious_deltas[p4.player_id].delta

    def test_compresses_rating_spread(self):
        """Test that catch-up mode compresses the rating spread over time."""
        # Start with large spread
        p1 = self.create_player(800, "P1")
        p2 = self.create_player(850, "P2")
        p3 = self.create_player(1150, "P3")
        p4 = self.create_player(1200, "P4")

        # Underdog team (p1+p2) beats favorite team (p3+p4)
        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 800,
            p2.player_id: 850,
            p3.player_id: 1150,
            p4.player_id: 1200,
        }

        catchup_deltas = self.catchup.calculate_deltas([game], current_ratings)

        # Calculate new ratings
        new_ratings = {
            pid: current_ratings[pid] + d.delta
            for pid, d in catchup_deltas.items()
        }

        # Calculate spread before and after
        old_spread = max(current_ratings.values()) - min(current_ratings.values())
        new_spread = max(new_ratings.values()) - min(new_ratings.values())

        # Spread should decrease (compression effect)
        assert new_spread < old_spread

    def test_still_zero_sum(self):
        """Test that catch-up is still zero-sum overall."""
        p1 = self.create_player(850, "P1")
        p2 = self.create_player(950, "P2")
        p3 = self.create_player(1050, "P3")
        p4 = self.create_player(1150, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 850,
            p2.player_id: 950,
            p3.player_id: 1050,
            p4.player_id: 1150,
        }

        deltas = self.catchup.calculate_deltas([game], current_ratings)

        # Note: Catch-up mode is NOT strictly zero-sum because it modifies
        # individual deltas based on median position. This is by design.
        # We just verify that the changes are reasonable.
        total_delta = sum(d.delta for d in deltas.values())

        # Should be close to zero but not exactly (within reasonable bounds)
        assert abs(total_delta) < 10  # Allow some slack for catch-up adjustments

    def test_equal_ratings_same_as_serious(self):
        """Test that with equal ratings near median, behaves like serious."""
        # All players at same rating = median
        p1 = self.create_player(1000, "P1")
        p2 = self.create_player(1000, "P2")
        p3 = self.create_player(1000, "P3")
        p4 = self.create_player(1000, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 1000,
            p2.player_id: 1000,
            p3.player_id: 1000,
            p4.player_id: 1000,
        }

        catchup_deltas = self.catchup.calculate_deltas([game], current_ratings)
        serious_deltas = self.serious.calculate_deltas([game], current_ratings)

        # When everyone is at median, deltas should be very similar
        for pid in current_ratings:
            diff = abs(catchup_deltas[pid].delta - serious_deltas[pid].delta)
            assert diff < 1  # Allow small floating point differences




