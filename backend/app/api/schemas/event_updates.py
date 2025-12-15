from typing import Optional
from pydantic import BaseModel, Field

class EventUpdate(BaseModel):
    """Request to update an event."""
    
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    
    class Config:
        populate_by_name = True
