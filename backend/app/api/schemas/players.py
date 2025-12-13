from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field


class MembershipType(str, Enum):
    """Membership type for players in a group."""

    PERMANENT = "PERMANENT"
    SUB = "SUB"


class SkillLevel(str, Enum):
    """Skill level for sub players (affects starting rating)."""

    ADVANCED = "ADVANCED"      # +100 from base rating
    INTERMEDIATE = "INTERMEDIATE"  # Base rating (default)
    BEGINNER = "BEGINNER"      # -100 from base rating


class PlayerCreate(BaseModel):
    """Request to create a player."""

    display_name: str = Field(..., min_length=1, max_length=100, alias="displayName")
    notes: Optional[str] = Field(None, max_length=500)

    class Config:
        populate_by_name = True


class PlayerUpdate(BaseModel):
    """Request to update a player."""

    display_name: Optional[str] = Field(None, min_length=1, max_length=100, alias="displayName")
    notes: Optional[str] = Field(None, max_length=500)

    class Config:
        populate_by_name = True


class PlayerResponse(BaseModel):
    """Player response."""

    id: UUID
    display_name: str = Field(alias="displayName")
    notes: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


class PlayerListResponse(BaseModel):
    """Response for listing players."""

    players: list[PlayerResponse]


class BulkPlayerCreate(BaseModel):
    """Request to create multiple players at once."""

    names: list[str] = Field(..., min_length=1, max_length=100, description="List of player names to create")

    class Config:
        populate_by_name = True


class BulkPlayerCreateResponse(BaseModel):
    """Response for bulk player creation."""

    created: list[PlayerResponse] = Field(default_factory=list, description="Successfully created players")
    skipped: list[str] = Field(default_factory=list, description="Names that were skipped (duplicates)")
    errors: list[str] = Field(default_factory=list, description="Names that failed to create")

    class Config:
        populate_by_name = True


class AddPlayerToGroupRequest(BaseModel):
    """Request to add player to group."""

    player_id: UUID = Field(alias="playerId")
    membership_type: MembershipType = Field(
        default=MembershipType.PERMANENT, alias="membershipType"
    )
    skill_level: Optional[SkillLevel] = Field(
        default=None, alias="skillLevel",
        description="Skill level for subs (affects starting rating). Only used for SUB members."
    )

    class Config:
        populate_by_name = True


class BulkAddPlayerItem(BaseModel):
    """Single player item for bulk add operation."""

    player_id: UUID = Field(alias="playerId")
    membership_type: MembershipType = Field(
        default=MembershipType.PERMANENT, alias="membershipType"
    )
    skill_level: Optional[SkillLevel] = Field(
        default=None, alias="skillLevel"
    )

    class Config:
        populate_by_name = True


class BulkAddPlayersToGroupRequest(BaseModel):
    """Request to add multiple players to a group."""

    players: list[BulkAddPlayerItem] = Field(
        ..., min_length=1, max_length=100, description="List of players to add"
    )

    class Config:
        populate_by_name = True


class BulkAddPlayersToGroupResponse(BaseModel):
    """Response for bulk adding players to a group."""

    added: list["GroupPlayerResponse"] = Field(
        default_factory=list, description="Successfully added players"
    )
    skipped: list[str] = Field(
        default_factory=list, description="Player IDs that were skipped (already in group)"
    )

    class Config:
        populate_by_name = True


class UpdateGroupPlayerRequest(BaseModel):
    """Request to update a group player's membership type and/or skill level."""

    membership_type: Optional[MembershipType] = Field(None, alias="membershipType")
    skill_level: Optional[SkillLevel] = Field(None, alias="skillLevel")

    class Config:
        populate_by_name = True


class GroupPlayerResponse(BaseModel):
    """Group player (membership) response."""

    id: UUID
    player_id: UUID = Field(alias="playerId")
    group_id: UUID = Field(alias="groupId")
    display_name: str = Field(alias="displayName")
    membership_type: MembershipType = Field(alias="membershipType")
    skill_level: Optional[SkillLevel] = Field(None, alias="skillLevel")
    rating: float
    games_played: int = Field(alias="gamesPlayed")
    wins: int
    losses: int
    ties: int
    win_rate: float = Field(alias="winRate")

    class Config:
        from_attributes = True
        populate_by_name = True


class GroupPlayerListResponse(BaseModel):
    """Response for listing group players."""

    players: list[GroupPlayerResponse]
