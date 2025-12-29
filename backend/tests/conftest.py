"""
Pytest configuration and fixtures.
"""
import pytest


@pytest.fixture
def sample_players():
    """Create sample players for testing."""
    from uuid import uuid4
    from app.domain.matchmaking.constraints import Player

    return [
        Player(id=uuid4(), rating=1000, display_name="Alice"),
        Player(id=uuid4(), rating=1050, display_name="Bob"),
        Player(id=uuid4(), rating=1100, display_name="Charlie"),
        Player(id=uuid4(), rating=950, display_name="Diana"),
        Player(id=uuid4(), rating=1025, display_name="Eve"),
        Player(id=uuid4(), rating=975, display_name="Frank"),
        Player(id=uuid4(), rating=1075, display_name="Grace"),
        Player(id=uuid4(), rating=925, display_name="Henry"),
    ]


@pytest.fixture
def constraint_config():
    """Create default constraint config for testing."""
    from app.domain.matchmaking.constraints import ConstraintConfig

    return ConstraintConfig(
        no_repeat_teammate_in_event=True,
        no_repeat_teammate_from_previous_event=True,
        no_repeat_opponent_in_event=True,
        elo_diff=0.10,
        auto_relax_elo_diff=True,
        auto_relax_step=0.02,
        auto_relax_max_elo_diff=0.30,
    )







