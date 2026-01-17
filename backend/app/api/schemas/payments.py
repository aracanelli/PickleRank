"""Pydantic schemas for payment tracking."""
from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field


class PaymentType(str, Enum):
    """Type of payment record."""
    ATTENDANCE = "ATTENDANCE"  # Automatic charge when sub attends event
    PAYMENT = "PAYMENT"        # Manual payment recorded
    ADJUSTMENT = "ADJUSTMENT"  # Manual adjustment (credit/correction)


class PaymentSettings(BaseModel):
    """Payment tracking settings for a group."""
    
    sub_fee_per_attendance: float = Field(
        default=5.0, 
        ge=0, 
        le=1000,
        alias="subFeePerAttendance",
        description="Amount charged per sub attendance"
    )
    currency: str = Field(
        default="USD", 
        max_length=3,
        description="Currency code (e.g., USD, EUR)"
    )
    track_payments: bool = Field(
        default=False, 
        alias="trackPayments",
        description="Whether payment tracking is enabled for this group"
    )

    class Config:
        populate_by_name = True


class SubBalance(BaseModel):
    """Sub player balance summary."""
    
    group_player_id: UUID = Field(alias="groupPlayerId")
    player_id: UUID = Field(alias="playerId")
    display_name: str = Field(alias="displayName")
    membership_type: str = Field(alias="membershipType")
    total_attendances: int = Field(alias="totalAttendances")
    total_charges: float = Field(alias="totalCharges")
    total_payments: float = Field(alias="totalPayments")
    balance: float = Field(
        description="Current balance. Negative = owes money, Positive = credit"
    )
    last_payment_date: Optional[datetime] = Field(None, alias="lastPaymentDate")

    class Config:
        populate_by_name = True


class SubBalanceListResponse(BaseModel):
    """List of sub balances."""
    
    balances: List[SubBalance]
    total_owed: float = Field(alias="totalOwed", description="Sum of all negative balances")
    
    class Config:
        populate_by_name = True


class RecordPaymentRequest(BaseModel):
    """Request to record a payment from a sub player."""
    
    group_player_id: UUID = Field(alias="groupPlayerId")
    amount: float = Field(gt=0, le=10000, description="Payment amount (positive)")
    notes: Optional[str] = Field(None, max_length=500)

    class Config:
        populate_by_name = True


class RecordAdjustmentRequest(BaseModel):
    """Request to record an adjustment (credit or debit)."""
    
    group_player_id: UUID = Field(alias="groupPlayerId")
    amount: float = Field(
        description="Adjustment amount. Positive = credit, Negative = debit"
    )
    notes: Optional[str] = Field(None, max_length=500)

    class Config:
        populate_by_name = True


class PaymentHistoryItem(BaseModel):
    """Single payment history entry."""
    
    id: UUID
    amount: float
    payment_type: PaymentType = Field(alias="paymentType")
    event_id: Optional[UUID] = Field(None, alias="eventId")
    event_name: Optional[str] = Field(None, alias="eventName")
    notes: Optional[str] = None
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True


class PaymentHistoryResponse(BaseModel):
    """Payment history for a player."""
    
    group_player_id: UUID = Field(alias="groupPlayerId")
    display_name: str = Field(alias="displayName")
    history: List[PaymentHistoryItem]
    current_balance: float = Field(alias="currentBalance")

    class Config:
        populate_by_name = True


class PaymentResponse(BaseModel):
    """Response after recording a payment."""
    
    id: UUID
    amount: float
    payment_type: PaymentType = Field(alias="paymentType")
    new_balance: float = Field(alias="newBalance")
    created_at: datetime = Field(alias="createdAt")

    class Config:
        populate_by_name = True
