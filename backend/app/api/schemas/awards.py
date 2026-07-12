"""Pydantic schemas for the Awards feature."""
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class AwardEditionStatus(str, Enum):
    """Lifecycle status of an award edition."""
    DRAFT = "DRAFT"
    VOTING_OPEN = "VOTING_OPEN"
    CLOSED = "CLOSED"


# ---------------------------------------------------------------------------
# Response DTOs
# ---------------------------------------------------------------------------


class AwardResultDto(BaseModel):
    """A single tallied result within a category (only revealed when CLOSED)."""

    nominee_group_player_id: UUID = Field(alias="nomineeGroupPlayerId")
    display_name: str = Field(alias="displayName")
    votes: int

    class Config:
        populate_by_name = True


class AwardCategoryDto(BaseModel):
    """A voting category within an award edition."""

    id: UUID
    title: str
    description: Optional[str] = None
    # Caller's current pick = nominee group-player id; populated only if they voted.
    my_vote: Optional[UUID] = Field(None, alias="myVote")
    # ONLY populated when the parent edition status == CLOSED.
    results: Optional[List[AwardResultDto]] = None
    total_votes: Optional[int] = Field(None, alias="totalVotes")

    class Config:
        populate_by_name = True


class AwardEditionDto(BaseModel):
    """The latest award edition for a group."""

    id: UUID
    title: str
    status: AwardEditionStatus
    # Frozen JSON snapshot computed by the client; echoed verbatim by the backend.
    stat_awards: List[Dict[str, Any]] = Field(default_factory=list, alias="statAwards")
    categories: List[AwardCategoryDto] = Field(default_factory=list)
    # status == VOTING_OPEN && caller has a linked player.
    can_vote: bool = Field(alias="canVote")
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True


class VoteResponse(BaseModel):
    """Response after casting/updating a vote."""

    ok: bool = True
    my_vote: UUID = Field(alias="myVote")

    class Config:
        populate_by_name = True


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------


class CreateEditionRequest(BaseModel):
    """Body for creating a DRAFT award edition."""

    title: str = Field(min_length=1, max_length=200)
    # Opaque stat-award snapshot; stored + echoed verbatim (never recomputed).
    stat_awards: List[Dict[str, Any]] = Field(default_factory=list, alias="statAwards")

    class Config:
        populate_by_name = True


class UpdateEditionRequest(BaseModel):
    """Body for updating an award edition's title and/or status."""

    title: Optional[str] = Field(None, min_length=1, max_length=200)
    status: Optional[AwardEditionStatus] = None

    class Config:
        populate_by_name = True


class CreateCategoryRequest(BaseModel):
    """Body for adding a voting category to an edition."""

    title: str = Field(min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

    class Config:
        populate_by_name = True


class VoteRequest(BaseModel):
    """Body for casting a vote in a category."""

    nominee_group_player_id: UUID = Field(alias="nomineeGroupPlayerId")

    class Config:
        populate_by_name = True
