"""
Unit tests for Serious ELO rating system.
"""
import pytest
from uuid import uuid4

from app.domain.ratings.base import GameForRating, GameResult, PlayerRating
from app.domain.ratings.serious_elo import SeriousEloRating


class TestSeriousEloRating:
    """Tests for the SeriousEloRating class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.rating_system = SeriousEloRating(k_factor=32)

    def create_player(self, rating: float, name: str = "Player") -> PlayerRating:
        """Create a test player."""
        return PlayerRating(
            player_id=uuid4(),
            rating=rating,
            display_name=name,
        )

    def test_team1_win_increases_ratings(self):
        """Test that team 1 winning increases their ratings."""
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

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # Team 1 should gain rating
        assert deltas[p1.player_id].delta > 0
        assert deltas[p2.player_id].delta > 0

        # Team 2 should lose rating
        assert deltas[p3.player_id].delta < 0
        assert deltas[p4.player_id].delta < 0

    def test_team2_win_increases_their_ratings(self):
        """Test that team 2 winning increases their ratings."""
        p1 = self.create_player(1000, "P1")
        p2 = self.create_player(1000, "P2")
        p3 = self.create_player(1000, "P3")
        p4 = self.create_player(1000, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM2_WIN,
        )

        current_ratings = {
            p1.player_id: 1000,
            p2.player_id: 1000,
            p3.player_id: 1000,
            p4.player_id: 1000,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # Team 1 should lose rating
        assert deltas[p1.player_id].delta < 0
        assert deltas[p2.player_id].delta < 0

        # Team 2 should gain rating
        assert deltas[p3.player_id].delta > 0
        assert deltas[p4.player_id].delta > 0

    def test_tie_gives_small_changes(self):
        """Test that ties give smaller rating changes."""
        p1 = self.create_player(1000, "P1")
        p2 = self.create_player(1000, "P2")
        p3 = self.create_player(1000, "P3")
        p4 = self.create_player(1000, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TIE,
        )

        current_ratings = {
            p1.player_id: 1000,
            p2.player_id: 1000,
            p3.player_id: 1000,
            p4.player_id: 1000,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # With equal ratings and a tie, all deltas should be near 0
        for player_id in current_ratings:
            assert abs(deltas[player_id].delta) < 0.1

    def test_underdog_wins_bigger_gain(self):
        """Test that lower-rated team winning gets bigger gain."""
        # Team 1: lower rated (underdogs)
        p1 = self.create_player(900, "P1")
        p2 = self.create_player(900, "P2")
        # Team 2: higher rated (favorites)
        p3 = self.create_player(1100, "P3")
        p4 = self.create_player(1100, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,  # Underdog wins
        )

        current_ratings = {
            p1.player_id: 900,
            p2.player_id: 900,
            p3.player_id: 1100,
            p4.player_id: 1100,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # Underdog win should give more than 16 (half of k-factor)
        assert deltas[p1.player_id].delta > 16
        assert deltas[p2.player_id].delta > 16

    def test_favorite_wins_smaller_gain(self):
        """Test that higher-rated team winning gets smaller gain."""
        # Team 1: higher rated (favorites)
        p1 = self.create_player(1100, "P1")
        p2 = self.create_player(1100, "P2")
        # Team 2: lower rated
        p3 = self.create_player(900, "P3")
        p4 = self.create_player(900, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,  # Favorite wins
        )

        current_ratings = {
            p1.player_id: 1100,
            p2.player_id: 1100,
            p3.player_id: 900,
            p4.player_id: 900,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # Favorite win should give less than 16 (half of k-factor)
        assert deltas[p1.player_id].delta < 16
        assert deltas[p2.player_id].delta < 16

    def test_zero_sum_game(self):
        """Test that rating changes sum to zero (zero-sum)."""
        p1 = self.create_player(1050, "P1")
        p2 = self.create_player(950, "P2")
        p3 = self.create_player(1100, "P3")
        p4 = self.create_player(900, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.TEAM1_WIN,
        )

        current_ratings = {
            p1.player_id: 1050,
            p2.player_id: 950,
            p3.player_id: 1100,
            p4.player_id: 900,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        total_delta = sum(d.delta for d in deltas.values())
        assert abs(total_delta) < 0.01  # Should be zero

    def test_multiple_games_accumulate(self):
        """Test that multiple games accumulate rating changes."""
        p1 = self.create_player(1000, "P1")
        p2 = self.create_player(1000, "P2")
        p3 = self.create_player(1000, "P3")
        p4 = self.create_player(1000, "P4")

        games = [
            GameForRating(
                team1=(p1, p2),
                team2=(p3, p4),
                result=GameResult.TEAM1_WIN,
            ),
            GameForRating(
                team1=(p1, p3),
                team2=(p2, p4),
                result=GameResult.TEAM1_WIN,
            ),
        ]

        current_ratings = {
            p1.player_id: 1000,
            p2.player_id: 1000,
            p3.player_id: 1000,
            p4.player_id: 1000,
        }

        deltas = self.rating_system.calculate_deltas(games, current_ratings)

        # P1 won both games, should have highest gain
        assert deltas[p1.player_id].delta > deltas[p2.player_id].delta
        assert deltas[p1.player_id].delta > deltas[p3.player_id].delta

    def test_unset_games_skipped(self):
        """Test that UNSET games are skipped."""
        p1 = self.create_player(1000, "P1")
        p2 = self.create_player(1000, "P2")
        p3 = self.create_player(1000, "P3")
        p4 = self.create_player(1000, "P4")

        game = GameForRating(
            team1=(p1, p2),
            team2=(p3, p4),
            result=GameResult.UNSET,
        )

        current_ratings = {
            p1.player_id: 1000,
            p2.player_id: 1000,
            p3.player_id: 1000,
            p4.player_id: 1000,
        }

        deltas = self.rating_system.calculate_deltas([game], current_ratings)

        # No deltas should be returned for UNSET games
        assert len(deltas) == 0







