"""
Unit tests for matchmaking constraints.
"""
import pytest
from uuid import uuid4

from app.domain.matchmaking.constraints import (
    ConstraintChecker,
    ConstraintConfig,
    Game,
    Player,
)


class TestConstraintChecker:
    """Tests for the ConstraintChecker class."""

    def setup_method(self):
        """Set up test fixtures."""
        self.config = ConstraintConfig(
            no_repeat_teammate_in_event=True,
            no_repeat_teammate_from_previous_event=True,
            no_repeat_opponent_in_event=True,
            elo_diff=0.05,
        )
        self.checker = ConstraintChecker(self.config)

    def test_teammate_constraint_in_event_passes(self):
        """Test that new teammate pair passes constraint."""
        p1, p2 = uuid4(), uuid4()
        existing_pairs = {frozenset([uuid4(), uuid4()])}

        assert self.checker.check_teammate_constraint_in_event(
            frozenset([p1, p2]), existing_pairs
        )

    def test_teammate_constraint_in_event_fails(self):
        """Test that repeated teammate pair fails constraint."""
        p1, p2 = uuid4(), uuid4()
        existing_pairs = {frozenset([p1, p2])}

        assert not self.checker.check_teammate_constraint_in_event(
            frozenset([p1, p2]), existing_pairs
        )

    def test_teammate_constraint_disabled(self):
        """Test that constraint passes when disabled."""
        config = ConstraintConfig(no_repeat_teammate_in_event=False)
        checker = ConstraintChecker(config)

        p1, p2 = uuid4(), uuid4()
        existing_pairs = {frozenset([p1, p2])}

        assert checker.check_teammate_constraint_in_event(
            frozenset([p1, p2]), existing_pairs
        )

    def test_teammate_from_previous_event_passes(self):
        """Test that new teammate pair passes previous event constraint."""
        p1, p2 = uuid4(), uuid4()
        previous_pairs = {frozenset([uuid4(), uuid4()])}

        checker = ConstraintChecker(self.config, previous_pairs)

        assert checker.check_teammate_constraint_from_previous(frozenset([p1, p2]))

    def test_teammate_from_previous_event_fails(self):
        """Test that repeated teammate from previous event fails."""
        p1, p2 = uuid4(), uuid4()
        previous_pairs = {frozenset([p1, p2])}

        checker = ConstraintChecker(self.config, previous_pairs)

        assert not checker.check_teammate_constraint_from_previous(frozenset([p1, p2]))

    def test_opponent_constraint_passes(self):
        """Test that new opponent pairs pass constraint."""
        new_pairs = {frozenset([uuid4(), uuid4()])}
        opponent_counts = {frozenset([uuid4(), uuid4()]): 1}  # Different pair, should pass

        assert self.checker.check_opponent_constraint(new_pairs, opponent_counts)

    def test_opponent_constraint_fails(self):
        """Test that opponent pair exceeding 2 matches fails constraint."""
        p1, p2 = uuid4(), uuid4()
        new_pairs = {frozenset([p1, p2])}
        opponent_counts = {frozenset([p1, p2]): 2}  # Already 2 matches, adding one more would exceed limit

        assert not self.checker.check_opponent_constraint(new_pairs, opponent_counts)

    def test_opponent_constraint_allows_two_matches(self):
        """Test that opponent pair can appear up to 2 times."""
        p1, p2 = uuid4(), uuid4()
        new_pairs = {frozenset([p1, p2])}
        opponent_counts = {frozenset([p1, p2]): 1}  # One match already, adding one more = 2 total, should pass

        assert self.checker.check_opponent_constraint(new_pairs, opponent_counts)

    def test_rating_balance_passes(self):
        """Test that balanced teams pass rating constraint."""
        # 1000 vs 1040 = 4% difference < 5%
        assert self.checker.check_rating_balance(1000, 1040, 0.05)

    def test_rating_balance_fails(self):
        """Test that imbalanced teams fail rating constraint."""
        # 1000 vs 1100 = 10% difference > 5%
        assert not self.checker.check_rating_balance(1000, 1100, 0.05)

    def test_rating_balance_exact_boundary(self):
        """Test rating at exactly the boundary."""
        # 1000 vs 1050 = 5% difference == 5%
        assert self.checker.check_rating_balance(1000, 1050, 0.05)


class TestGame:
    """Tests for the Game dataclass."""

    def test_all_players(self):
        """Test getting all players from a game."""
        p1, p2, p3, p4 = uuid4(), uuid4(), uuid4(), uuid4()
        game = Game(
            round_index=0,
            court_index=0,
            team1=(p1, p2),
            team2=(p3, p4),
        )

        assert game.all_players() == {p1, p2, p3, p4}

    def test_teammate_pairs(self):
        """Test getting teammate pairs from a game."""
        p1, p2, p3, p4 = uuid4(), uuid4(), uuid4(), uuid4()
        game = Game(
            round_index=0,
            court_index=0,
            team1=(p1, p2),
            team2=(p3, p4),
        )

        pairs = game.teammate_pairs()
        assert frozenset([p1, p2]) in pairs
        assert frozenset([p3, p4]) in pairs
        assert len(pairs) == 2

    def test_opponent_pairs(self):
        """Test getting opponent pairs from a game."""
        p1, p2, p3, p4 = uuid4(), uuid4(), uuid4(), uuid4()
        game = Game(
            round_index=0,
            court_index=0,
            team1=(p1, p2),
            team2=(p3, p4),
        )

        pairs = game.opponent_pairs()
        assert frozenset([p1, p3]) in pairs
        assert frozenset([p1, p4]) in pairs
        assert frozenset([p2, p3]) in pairs
        assert frozenset([p2, p4]) in pairs
        assert len(pairs) == 4







