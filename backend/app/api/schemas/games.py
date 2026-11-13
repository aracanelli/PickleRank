from typing import Optional

from pydantic import BaseModel, Field

from app.api.schemas.events import GameResponse


class ScoreUpdateRequest(BaseModel):
    """Request to update game score."""

    score_team1: Optional[float] = Field(None, ge=0, alias="scoreTeam1")
    score_team2: Optional[float] = Field(None, ge=0, alias="scoreTeam2")
    # Epoch ms when the score was typed on the device; replays older than the stored edit are ignored.
    edited_at: Optional[int] = Field(None, ge=0, alias="editedAt")
    # editedAt of the game as this device last saw it. If nobody changed the score since, the write
    # wins whatever the device clock says (a slow clock must not lose a deliberate correction).
    base_edited_at: Optional[int] = Field(None, ge=0, alias="baseEditedAt")

    class Config:
        populate_by_name = True


class ScoreUpdateResponse(GameResponse):
    """Response from score update."""

    pass


class GameUpdatePlayersRequest(BaseModel):
    """Request to update player positions in a game."""

    team1_p1: str = Field(..., alias="team1P1")
    team1_p2: str = Field(..., alias="team1P2")
    team2_p1: str = Field(..., alias="team2P1")
    team2_p2: str = Field(..., alias="team2P2")

    class Config:
        populate_by_name = True








