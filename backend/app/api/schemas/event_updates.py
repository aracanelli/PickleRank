from typing import Optional
from pydantic import BaseModel, Field, field_validator


class EventUpdate(BaseModel):
    """Request to update an event."""

    name: Optional[str] = Field(None, min_length=1, max_length=100)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, v: Optional[str]) -> Optional[str]:
        return v.strip() if isinstance(v, str) else v

    class Config:
        populate_by_name = True
