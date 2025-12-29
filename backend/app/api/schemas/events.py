from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class EventStatus(str, Enum):
    """Event status."""

    DRAFT = "DRAFT"
    GENERATED = "GENERATED"
    IN_PROGRESS = "IN_PROGRESS"
    COMPLETED = "COMPLETED"


class GameResult(str, Enum):
    """Game result."""

    TEAM1_WIN = "TEAM1_WIN"
    TEAM2_WIN = "TEAM2_WIN"
    TIE = "TIE"
    UNSET = "UNSET"


class PlayerInfo(BaseModel):
    """Player info for game response."""

    id: UUID
    display_name: str = Field(alias="displayName")

    class Config:
        populate_by_name = True


class GameResponse(BaseModel):
    """Game response."""

    id: UUID
    round_index: int = Field(alias="roundIndex")
    court_index: int = Field(alias="courtIndex")
    team1: List[PlayerInfo]
    team2: List[PlayerInfo]
    score_team1: Optional[float] = Field(None, alias="scoreTeam1")
    score_team2: Optional[float] = Field(None, alias="scoreTeam2")
    team1_elo: Optional[float] = Field(None, alias="team1Elo")
    team2_elo: Optional[float] = Field(None, alias="team2Elo")
    result: GameResult

    class Config:
        populate_by_name = True


class GenerationMeta(BaseModel):
    """Metadata about schedule generation."""

    seed_used: str = Field(alias="seedUsed")
    elo_diff_configured: float = Field(alias="eloDiffConfigured")
    elo_diff_used: float = Field(alias="eloDiffUsed")
    relax_iterations: int = Field(alias="relaxIterations")
    attempts: int
    duration_ms: float = Field(alias="durationMs")
    constraint_toggles: Dict[str, bool] = Field(alias="constraintToggles")

    class Config:
        populate_by_name = True


class EventResponse(BaseModel):
    """Event response."""

    id: UUID
    group_id: UUID = Field(alias="groupId")
    name: Optional[str] = None
    status: EventStatus
    starts_at: Optional[datetime] = Field(None, alias="startsAt")
    courts: int
    rounds: int
    participant_count: int = Field(alias="participantCount")
    generation_meta: Optional[GenerationMeta] = Field(None, alias="generationMeta")
    games: List[GameResponse]

    class Config:
        populate_by_name = True


class EventListItem(BaseModel):
    """Event list item."""

    id: UUID
    group_id: UUID = Field(alias="groupId")
    name: Optional[str] = None
    status: EventStatus
    starts_at: Optional[datetime] = Field(None, alias="startsAt")
    courts: int
    rounds: int

    class Config:
        populate_by_name = True


class EventListResponse(BaseModel):
    """Response for listing events."""

    events: List[EventListItem]


class EventCreate(BaseModel):
    """Request to create an event."""

    name: str = Field(min_length=1, max_length=100)
    starts_at: datetime = Field(default_factory=datetime.now, alias="startsAt")
    courts: int = Field(ge=1, le=10)
    rounds: int = Field(ge=1, le=20)
    participant_ids: List[UUID] = Field(alias="participantIds")

    class Config:
        populate_by_name = True


class GenerateRequest(BaseModel):
    """Request to generate schedule."""

    new_seed: bool = Field(default=False, alias="newSeed")

    class Config:
        populate_by_name = True


class GenerateResponse(BaseModel):
    """Response after generation."""

    status: EventStatus
    generation_meta: GenerationMeta = Field(alias="generationMeta")
    games: List[GameResponse]

    class Config:
        populate_by_name = True


class SwapRequest(BaseModel):
    """Request to swap players."""

    round_index: int = Field(alias="roundIndex")
    player1_id: UUID = Field(alias="player1Id")
    player2_id: UUID = Field(alias="player2Id")

    class Config:
        populate_by_name = True


class SwapResponse(BaseModel):
    """Response after swap."""

    success: bool
    warnings: List[str]


class RatingUpdate(BaseModel):
    """Rating update for a player."""

    player_id: UUID = Field(alias="playerId")
    display_name: str = Field(alias="displayName")
    rating_before: float = Field(alias="ratingBefore")
    rating_after: float = Field(alias="ratingAfter")
    delta: float

    class Config:
        populate_by_name = True


class CompleteResponse(BaseModel):
    """Response after completing event."""

    status: EventStatus
    rating_updates: List[RatingUpdate] = Field(alias="ratingUpdates")

    class Config:
        populate_by_name = True



