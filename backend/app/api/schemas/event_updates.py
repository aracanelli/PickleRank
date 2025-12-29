from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class EventUpdate(BaseModel):
    """Request to update an event."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    
    class Config:
        populate_by_name = True


class EventRatingHistoryItem(BaseModel):
    """Single point in rating history."""

    round: int
    rating: float
    type: str
    label: str
    delta: Optional[float] = None


    class Config:
        populate_by_name = True


RatingHistoryResponse = Dict[str, List[EventRatingHistoryItem]]
