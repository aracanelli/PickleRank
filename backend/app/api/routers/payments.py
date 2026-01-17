"""Payment tracking API endpoints."""
from uuid import UUID

from asyncpg import Connection
from fastapi import APIRouter, Depends, Request

from app.api.deps.auth import CurrentUser, get_current_user
from app.api.deps.db import get_db
from app.api.deps.rate_limit import DEFAULT_RATE, limiter
from app.api.schemas.payments import (
    PaymentHistoryResponse,
    PaymentResponse,
    RecordAdjustmentRequest,
    RecordPaymentRequest,
    SubBalanceListResponse,
)
from app.application.services.payment_service import PaymentService

router = APIRouter()


@router.get("/groups/{group_id}/payments/balances", response_model=SubBalanceListResponse)
@limiter.limit(DEFAULT_RATE)
async def get_sub_balances(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Get balance summaries for all sub players in a group.
    
    Returns a list of sub players with their:
    - Total attendances
    - Total charges
    - Total payments
    - Current balance (negative = owes, positive = credit)
    - Last payment date
    """
    service = PaymentService(db)
    return await service.get_sub_balances(user.user_id, group_id)


@router.post("/groups/{group_id}/payments", response_model=PaymentResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def record_payment(
    request: Request,
    group_id: UUID,
    data: RecordPaymentRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Record a payment from a sub player.
    
    The amount should be positive and will be added to the player's balance.
    """
    service = PaymentService(db)
    return await service.record_payment(
        user.user_id,
        group_id,
        data.group_player_id,
        data.amount,
        data.notes,
    )


@router.post("/groups/{group_id}/payments/adjustment", response_model=PaymentResponse, status_code=201)
@limiter.limit(DEFAULT_RATE)
async def record_adjustment(
    request: Request,
    group_id: UUID,
    data: RecordAdjustmentRequest,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Record an adjustment for a sub player.
    
    The amount can be positive (credit) or negative (debit).
    Use this for corrections or special cases.
    """
    service = PaymentService(db)
    return await service.record_adjustment(
        user.user_id,
        group_id,
        data.group_player_id,
        data.amount,
        data.notes,
    )


@router.get("/groups/{group_id}/payments/{group_player_id}/history", response_model=PaymentHistoryResponse)
@limiter.limit(DEFAULT_RATE)
async def get_payment_history(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Get payment history for a specific player.
    
    Returns all payment records (charges, payments, adjustments) for the player.
    """
    service = PaymentService(db)
    return await service.get_payment_history(user.user_id, group_id, group_player_id)


@router.post("/groups/{group_id}/payments/{group_player_id}/mark-paid", response_model=PaymentResponse)
@limiter.limit(DEFAULT_RATE)
async def mark_all_paid(
    request: Request,
    group_id: UUID,
    group_player_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Zero out a player's balance by recording a payment for the full amount owed.
    
    Can only be used if the player has a negative balance (owes money).
    """
    service = PaymentService(db)
    return await service.mark_all_paid(user.user_id, group_id, group_player_id)


@router.post("/groups/{group_id}/payments/backfill")
@limiter.limit(DEFAULT_RATE)
async def backfill_historical_charges(
    request: Request,
    group_id: UUID,
    user: CurrentUser = Depends(get_current_user),
    db: Connection = Depends(get_db),
):
    """
    Backfill attendance charges for all completed events.
    
    Use this when payment tracking is enabled mid-season to retroactively
    charge subs for events they've already attended.
    
    Returns:
    - eventsProcessed: Number of events that had new charges added
    - chargesCreated: Total number of new charge records created
    - totalAmount: Total amount charged
    - feePerAttendance: The fee used per attendance
    """
    service = PaymentService(db)
    return await service.backfill_historical_charges(user.user_id, group_id)
