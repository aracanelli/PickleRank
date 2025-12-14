from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class RatingSystem(str, Enum):
    """Available rating systems."""

    SERIOUS_ELO = "SERIOUS_ELO"
    CATCH_UP = "CATCH_UP"
    RACS_ELO = "RACS_ELO"


class GroupSettings(BaseModel):
    """Group configuration settings."""

    rating_system: RatingSystem = Field(default=RatingSystem.SERIOUS_ELO, alias="ratingSystem")
    initial_rating: int = Field(default=1000, ge=0, le=3000, alias="initialRating")
    k_factor: int = Field(default=32, ge=1, le=200, alias="kFactor")
    elo_const: Optional[float] = Field(default=None, alias="eloConst")
    elo_diff: float = Field(default=0.05, ge=0.01, le=0.5, alias="eloDiff")
    no_repeat_teammate_in_event: bool = Field(default=True, alias="noRepeatTeammateInEvent")
    no_repeat_teammate_from_previous_event: bool = Field(
        default=True, alias="noRepeatTeammateFromPreviousEvent"
    )
    no_repeat_opponent_in_event: bool = Field(default=True, alias="noRepeatOpponentInEvent")
    auto_relax_elo_diff: bool = Field(default=True, alias="autoRelaxEloDiff")
    auto_relax_step: float = Field(default=0.01, ge=0.005, le=0.1, alias="autoRelaxStep")
    auto_relax_max_elo_diff: float = Field(default=0.25, ge=0.1, le=0.5, alias="autoRelaxMaxEloDiff")

    class Config:
        populate_by_name = True


class GroupCreate(BaseModel):
    """Request to create a group."""

    name: str = Field(..., min_length=1, max_length=100)
    sport: str = Field(default="pickleball", max_length=50)
    settings: Optional[GroupSettings] = None


class GroupUpdate(BaseModel):
    """Request to update a group."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)


class GroupSettingsUpdate(BaseModel):
    """Request to update group settings."""

    rating_system: Optional[RatingSystem] = Field(None, alias="ratingSystem")
    initial_rating: Optional[int] = Field(None, ge=0, le=3000, alias="initialRating")
    k_factor: Optional[int] = Field(None, ge=1, le=200, alias="kFactor")
    elo_const: Optional[float] = Field(None, alias="eloConst")
    elo_diff: Optional[float] = Field(None, ge=0.01, le=0.5, alias="eloDiff")
    no_repeat_teammate_in_event: Optional[bool] = Field(None, alias="noRepeatTeammateInEvent")
    no_repeat_teammate_from_previous_event: Optional[bool] = Field(
        None, alias="noRepeatTeammateFromPreviousEvent"
    )
    no_repeat_opponent_in_event: Optional[bool] = Field(None, alias="noRepeatOpponentInEvent")
    auto_relax_elo_diff: Optional[bool] = Field(None, alias="autoRelaxEloDiff")
    auto_relax_step: Optional[float] = Field(None, ge=0.005, le=0.1, alias="autoRelaxStep")
    auto_relax_max_elo_diff: Optional[float] = Field(None, ge=0.1, le=0.5, alias="autoRelaxMaxEloDiff")

    class Config:
        populate_by_name = True


class GroupResponse(BaseModel):
    """Group response."""

    id: UUID
    name: str
    sport: str
    settings: GroupSettings
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GroupListItem(BaseModel):
    """Group list item (summary)."""

    id: UUID
    name: str
    sport: str
    player_count: int = Field(alias="playerCount")
    created_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


class GroupListResponse(BaseModel):
    """Response for listing groups."""

    groups: list[GroupListItem]



