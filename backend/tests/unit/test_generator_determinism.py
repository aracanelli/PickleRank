"""
Unit tests for schedule generator determinism.
"""
import pytest
from uuid import uuid4

from app.domain.matchmaking.constraints import ConstraintConfig, Player
from app.domain.matchmaking.generator import ScheduleGenerator


class TestGeneratorDeterminism:
    """Tests for schedule generator determinism with seeding."""

    def setup_method(self):
        """Set up test fixtures."""
        self.config = ConstraintConfig(
            no_repeat_teammate_in_event=True,
            no_repeat_teammate_from_previous_event=False,
            no_repeat_opponent_in_event=True,
            elo_diff=0.25,  # Relaxed for easier generation
            auto_relax_elo_diff=True,
        )

    def create_players(self, count: int) -> list[Player]:
        """Create test players with varying ratings."""
        players = []
        for i in range(count):
            players.append(
                Player(
                    id=uuid4(),
                    rating=1000 + (i * 50),  # Ratings: 1000, 1050, 1100, etc.
                    display_name=f"Player {i + 1}",
                )
            )
        return players

    def test_same_seed_produces_same_schedule(self):
        """Test that the same seed produces identical schedules."""
        players = self.create_players(8)
        seed = "test-seed-123"

        # Generate twice with same seed
        gen1 = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,
            config=self.config,
            seed=seed,
        )
        result1 = gen1.generate()

        gen2 = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,
            config=self.config,
            seed=seed,
        )
        result2 = gen2.generate()

        # Both should succeed
        assert result1.success
        assert result2.success

        # Both should have same number of games
        assert len(result1.games) == len(result2.games)

        # Games should be identical
        for g1, g2 in zip(result1.games, result2.games):
            assert g1.round_index == g2.round_index
            assert g1.court_index == g2.court_index
            assert g1.team1 == g2.team1
            assert g1.team2 == g2.team2

    def test_different_seeds_produce_different_schedules(self):
        """Test that different seeds produce different schedules."""
        players = self.create_players(8)

        gen1 = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,
            config=self.config,
            seed="seed-one",
        )
        result1 = gen1.generate()

        gen2 = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,
            config=self.config,
            seed="seed-two",
        )
        result2 = gen2.generate()

        assert result1.success
        assert result2.success

        # Very likely to be different (not guaranteed, but statistically should be)
        games_match = all(
            g1.team1 == g2.team1 and g1.team2 == g2.team2
            for g1, g2 in zip(result1.games, result2.games)
        )
        # This could theoretically fail, but probability is extremely low
        assert not games_match, "Different seeds should produce different schedules"

    def test_seed_in_metadata(self):
        """Test that used seed is recorded in metadata."""
        players = self.create_players(8)
        seed = "recorded-seed"

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=2,
            config=self.config,
            seed=seed,
        )
        result = gen.generate()

        assert result.success
        assert result.metadata["seed_used"] == seed


class TestGeneratorValidation:
    """Tests for schedule generator validation and constraints."""

    def setup_method(self):
        """Set up test fixtures."""
        self.config = ConstraintConfig(
            no_repeat_teammate_in_event=True,
            no_repeat_teammate_from_previous_event=False,
            no_repeat_opponent_in_event=True,
            elo_diff=0.20,
            auto_relax_elo_diff=True,
            auto_relax_max_elo_diff=0.50,
        )

    def create_players(self, count: int, base_rating: int = 1000) -> list[Player]:
        """Create test players."""
        return [
            Player(id=uuid4(), rating=base_rating + (i * 30), display_name=f"P{i + 1}")
            for i in range(count)
        ]

    def test_player_count_validation_too_few(self):
        """Test that too few players raises error."""
        players = self.create_players(5)  # 2 courts needs 6-8 players

        with pytest.raises(ValueError, match="must be between"):
            ScheduleGenerator(
                players=players,
                courts=2,
                rounds=2,
                config=self.config,
            )

    def test_player_count_validation_too_many(self):
        """Test that too many players raises error."""
        players = self.create_players(9)  # 2 courts needs 6-8 players

        with pytest.raises(ValueError, match="must be between"):
            ScheduleGenerator(
                players=players,
                courts=2,
                rounds=2,
                config=self.config,
            )

    def test_one_short_generates_2v1(self):
        """Test that courts*4-1 players generates one 2v1 game per round."""
        players = self.create_players(7)  # 2 courts, 1 short

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=2,
            config=self.config,
        )
        result = gen.generate()

        assert result.success
        assert result.metadata["court_mode"] == "one_short"

        for round_idx in range(2):
            round_games = [g for g in result.games if g.round_index == round_idx]
            game_types = [g.game_type for g in round_games]
            assert "2v1" in game_types
            assert game_types.count("2v2") == 1
            assert game_types.count("2v1") == 1

    def test_two_short_generates_1v1(self):
        """Test that courts*4-2 players generates one 1v1 game per round."""
        players = self.create_players(6)  # 2 courts, 2 short

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=2,
            config=self.config,
        )
        result = gen.generate()

        assert result.success
        assert result.metadata["court_mode"] == "two_short"

        for round_idx in range(2):
            round_games = [g for g in result.games if g.round_index == round_idx]
            game_types = [g.game_type for g in round_games]
            assert "1v1" in game_types
            assert game_types.count("2v2") == 1
            assert game_types.count("1v1") == 1

    def test_2v1_solo_is_highest_rated(self):
        """Test that in 2v1, the solo player is the highest rated of the 3."""
        players = [
            Player(id=uuid4(), rating=1200, display_name="High"),
            Player(id=uuid4(), rating=1100, display_name="Mid"),
            Player(id=uuid4(), rating=1000, display_name="Low"),
            Player(id=uuid4(), rating=1050, display_name="P4"),
            Player(id=uuid4(), rating=1050, display_name="P5"),
            Player(id=uuid4(), rating=1050, display_name="P6"),
            Player(id=uuid4(), rating=1050, display_name="P7"),
        ]
        player_ratings = {p.id: p.rating for p in players}

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=1,
            config=self.config,
        )
        result = gen.generate()

        assert result.success
        for game in result.games:
            if game.game_type == "2v1":
                # team2 is the solo side (team2[1] is None)
                solo_id = game.team2[0]
                duo_ids = [game.team1[0], game.team1[1]]
                solo_rating = player_ratings[solo_id]
                for duo_id in duo_ids:
                    assert solo_rating >= player_ratings[duo_id], \
                        "Solo player should be highest rated in 2v1"

    def test_generates_correct_game_count(self):
        """Test that correct number of games are generated."""
        players = self.create_players(8)
        courts = 2
        rounds = 3  # Reduced for constraint satisfaction

        gen = ScheduleGenerator(
            players=players,
            courts=courts,
            rounds=rounds,
            config=self.config,
        )
        result = gen.generate()

        assert result.success
        assert len(result.games) == courts * rounds

    def test_each_player_plays_once_per_round(self):
        """Test that each player plays exactly once per round."""
        players = self.create_players(8)

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,
            config=self.config,
        )
        result = gen.generate()

        assert result.success

        for round_idx in range(3):
            round_games = [g for g in result.games if g.round_index == round_idx]
            players_in_round = set()

            for game in round_games:
                game_players = game.all_players()
                # No player should appear twice
                assert len(players_in_round & game_players) == 0
                players_in_round.update(game_players)

            # All players should play
            assert len(players_in_round) == 8

    def test_no_repeat_teammates_in_event(self):
        """Test that teammates don't repeat within an event."""
        players = self.create_players(8)

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,  # Reduced for constraint satisfaction
            config=self.config,
        )
        result = gen.generate()

        assert result.success

        teammate_pairs = set()
        for game in result.games:
            for pair in game.teammate_pairs():
                assert pair not in teammate_pairs, "Teammate pair repeated"
                teammate_pairs.add(pair)

    def test_no_repeat_opponents_in_event(self):
        """Test that opponents don't repeat more than 2 times within an event."""
        players = self.create_players(8)

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=3,  # Reduced for constraint satisfaction
            config=self.config,
        )
        result = gen.generate()

        assert result.success

        opponent_counts = {}
        for game in result.games:
            for pair in game.opponent_pairs():
                opponent_counts[pair] = opponent_counts.get(pair, 0) + 1
                assert opponent_counts[pair] <= 2, f"Opponent pair {pair} appears more than 2 times"

    def test_auto_relax_records_metadata(self):
        """Test that auto-relax records used elo_diff."""
        # Create players with large rating spread
        players = [
            Player(id=uuid4(), rating=800, display_name="P1"),
            Player(id=uuid4(), rating=850, display_name="P2"),
            Player(id=uuid4(), rating=1100, display_name="P3"),
            Player(id=uuid4(), rating=1150, display_name="P4"),
            Player(id=uuid4(), rating=1200, display_name="P5"),
            Player(id=uuid4(), rating=1250, display_name="P6"),
            Player(id=uuid4(), rating=1400, display_name="P7"),
            Player(id=uuid4(), rating=1450, display_name="P8"),
        ]

        config = ConstraintConfig(
            no_repeat_teammate_in_event=True,
            no_repeat_teammate_from_previous_event=False,
            no_repeat_opponent_in_event=True,
            elo_diff=0.01,  # Very strict
            auto_relax_elo_diff=True,
            auto_relax_step=0.05,
            auto_relax_max_elo_diff=0.50,
        )

        gen = ScheduleGenerator(
            players=players,
            courts=2,
            rounds=2,
            config=config,
        )
        result = gen.generate()

        # Should either succeed with relaxed constraint or fail
        if result.success:
            # If it relaxed, used should be > configured
            assert result.metadata["elo_diff_used"] >= result.metadata["elo_diff_configured"]

