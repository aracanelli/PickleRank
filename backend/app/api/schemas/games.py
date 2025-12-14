from typing import Optional

from pydantic import BaseModel, Field

from app.api.schemas.events import GameResponse


class ScoreUpdateRequest(BaseModel):
    """Request to update game score."""

    score_team1: Optional[float] = Field(None, ge=0, alias="scoreTeam1")
    score_team2: Optional[float] = Field(None, ge=0, alias="scoreTeam2")

    class Config:
        populate_by_name = True


class ScoreUpdateResponse(GameResponse):
    """Response from score update."""

    pass



