"""Focused regression tests for Rac's ELO behavior."""
from uuid import uuid4

from app.domain.ratings.base import GameForRating, GameResult, PlayerRating
from app.domain.ratings.racs_elo import RacsEloRating


def _game(result, score_team1=11, score_team2=9):
    players = [
        PlayerRating(uuid4(), 1000, "P1"),
        PlayerRating(uuid4(), 1000, "P2"),
        PlayerRating(uuid4(), 1000, "P3"),
        PlayerRating(uuid4(), 1000, "P4"),
    ]
    return GameForRating(
        team1=(players[0], players[1]),
        team2=(players[2], players[3]),
        result=result,
        score_team1=score_team1,
        score_team2=score_team2,
    ), players


def test_racs_elo_uses_existing_margin_of_victory_factor():
    game, players = _game(GameResult.TEAM1_WIN)
    ratings = {player.player_id: player.rating for player in players}

    deltas = RacsEloRating().calculate_deltas([game], ratings)

    assert deltas[players[0].player_id].delta > 0
    assert deltas[players[2].player_id].delta < 0
    assert deltas[players[0].player_id].rating_before == 1000


def test_racs_elo_does_not_apply_unfinished_games():
    game, players = _game(GameResult.UNSET, None, None)
    ratings = {player.player_id: player.rating for player in players}

    assert RacsEloRating().calculate_deltas([game], ratings) == {}
