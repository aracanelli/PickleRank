from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RankingEntry(BaseModel):
    """Ranking entry."""

    rank: int
    player_id: UUID = Field(alias="playerId")
    display_name: str = Field(alias="displayName")
    rating: float
    games_played: int = Field(alias="gamesPlayed")
    wins: int
    losses: int
    ties: int
    win_rate: float = Field(alias="winRate")

    class Config:
        populate_by_name = True


class RankingsResponse(BaseModel):
    """Response for group rankings."""

    rankings: List[RankingEntry]


class MatchHistoryEntry(BaseModel):
    """Match history entry."""

    game_id: UUID = Field(alias="gameId")
    event_id: UUID = Field(alias="eventId")
    event_name: Optional[str] = Field(None, alias="eventName")
    date: datetime
    round_index: int = Field(alias="roundIndex")
    court_index: int = Field(alias="courtIndex")
    team1: List[str]
    team2: List[str]
    score_team1: Optional[float] = Field(None, alias="scoreTeam1")
    score_team2: Optional[float] = Field(None, alias="scoreTeam2")
    result: str
    team1_elo: Optional[float] = Field(None, alias="team1Elo")
    team2_elo: Optional[float] = Field(None, alias="team2Elo")

    class Config:
        populate_by_name = True


class MatchHistoryResponse(BaseModel):
    """Response for match history."""

    matches: List[MatchHistoryEntry]




