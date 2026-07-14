"""Pydantic schemas for the Spond integration API."""

from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class SpondConnectRequest(BaseModel):
    """Connect (or re-connect) the current user's Spond account."""

    email: str = Field(min_length=3, max_length=256)
    password: str = Field(min_length=1, max_length=256)


class SpondStatusResponse(BaseModel):
    """Whether the current user has a connected Spond account."""

    connected: bool
    email: Optional[str] = None


class SpondGroupDto(BaseModel):
    """A Spond group the organizer belongs to (for the mapping picker)."""

    spond_group_id: str = Field(alias="spondGroupId")
    name: str
    member_count: int = Field(alias="memberCount")

    class Config:
        populate_by_name = True


class SpondGroupListResponse(BaseModel):
    groups: List[SpondGroupDto]


class SpondGroupLinkResponse(BaseModel):
    """The Spond group currently linked to a PickleRank group (if any)."""

    linked: bool
    spond_group_id: Optional[str] = Field(None, alias="spondGroupId")
    spond_group_name: Optional[str] = Field(None, alias="spondGroupName")

    class Config:
        populate_by_name = True


class SpondLinkGroupRequest(BaseModel):
    spond_group_id: str = Field(alias="spondGroupId")

    class Config:
        populate_by_name = True


class SpondEventDto(BaseModel):
    """An upcoming Spond event."""

    spond_event_id: str = Field(alias="spondEventId")
    name: str
    starts_at: Optional[str] = Field(None, alias="startsAt")
    accepted_count: int = Field(alias="acceptedCount")

    class Config:
        populate_by_name = True


class SpondEventListResponse(BaseModel):
    events: List[SpondEventDto]


class SpondResolvedAttendeeDto(BaseModel):
    """An event attendee resolved against this group's roster."""

    spond_member_id: str = Field(alias="spondMemberId")
    name: str
    # Set when a saved link (or exact suggestion) already resolves to a roster player.
    matched_group_player_id: Optional[UUID] = Field(None, alias="matchedGroupPlayerId")
    # A best-guess roster match for an unmatched attendee (organizer confirms).
    suggested_group_player_id: Optional[UUID] = Field(None, alias="suggestedGroupPlayerId")

    class Config:
        populate_by_name = True


class SpondResolveResponse(BaseModel):
    """Resolution result for a Spond event's attendees."""

    attendees: List[SpondResolvedAttendeeDto]
    # group_player IDs that are already linked and can be pre-selected immediately.
    matched_group_player_ids: List[UUID] = Field(alias="matchedGroupPlayerIds")

    class Config:
        populate_by_name = True


class SpondAttendeeLinkInput(BaseModel):
    """One organizer decision for an unmatched (or re-mapped) attendee."""

    spond_member_id: str = Field(alias="spondMemberId")
    # Either link to an existing group player...
    group_player_id: Optional[UUID] = Field(None, alias="groupPlayerId")
    # ...or create a new player with this display name and add them to the group.
    create_name: Optional[str] = Field(None, alias="createName", max_length=100)

    class Config:
        populate_by_name = True


class SpondConfirmLinksRequest(BaseModel):
    links: List[SpondAttendeeLinkInput]


class SpondConfirmLinksResponse(BaseModel):
    """Final set of group_player IDs to select in the participant picker."""

    group_player_ids: List[UUID] = Field(alias="groupPlayerIds")

    class Config:
        populate_by_name = True
