"""Payment service - handles payment tracking operations."""
from typing import Any, Dict, List
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.payments import (
    PaymentHistoryItem,
    PaymentHistoryResponse,
    PaymentResponse,
    PaymentType,
    SubBalance,
    SubBalanceListResponse,
)
from app.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.payments_repo import PaymentsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository


class PaymentService:
    """Service for payment tracking operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.payments_repo = PaymentsRepository(conn)

    async def _is_owner_or_organizer(self, user_id: str, group: dict) -> bool:
        """Check if the user is the group owner or has ORGANIZER role."""
        if str(group["owner_user_id"]) == user_id:
            return True
        return await self.group_players_repo.is_organizer(user_id, group["id"])

    async def _get_user_uuid(self, clerk_user_id: str) -> UUID:
        """Get the internal user UUID from Clerk user ID. Returns None if not found."""
        row = await self.conn.fetchrow(
            "SELECT id FROM users WHERE clerk_user_id = $1",
            clerk_user_id,
        )
        return row["id"] if row else None

    async def get_sub_balances(
        self, user_id: str, group_id: UUID
    ) -> SubBalanceListResponse:
        """Get balance summaries for all sub players in a group."""
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can view payment balances")

        # Check if payment tracking is enabled
        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})
        if not payment_settings.get("trackPayments", False):
            raise BadRequestError("Payment tracking is not enabled for this group")

        # Get balances
        balances = await self.payments_repo.get_sub_balances(group_id)

        # Calculate total owed (sum of negative balances)
        total_owed = sum(abs(b["balance"]) for b in balances if b["balance"] < 0)

        return SubBalanceListResponse(
            balances=[
                SubBalance(
                    groupPlayerId=b["group_player_id"],
                    playerId=b["player_id"],
                    displayName=b["display_name"],
                    membershipType=b["membership_type"],
                    totalAttendances=b["total_attendances"],
                    totalCharges=b["total_charges"],
                    totalPayments=b["total_payments"],
                    balance=b["balance"],
                    lastPaymentDate=b["last_payment_date"],
                )
                for b in balances
            ],
            totalOwed=total_owed,
        )

    async def record_payment(
        self,
        user_id: str,
        group_id: UUID,
        group_player_id: UUID,
        amount: float,
        notes: str = None,
    ) -> PaymentResponse:
        """Record a payment from a sub player."""
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can record payments")

        # Check if payment tracking is enabled
        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})
        if not payment_settings.get("trackPayments", False):
            raise BadRequestError("Payment tracking is not enabled for this group")

        # Verify player exists and is a sub in this group
        player_info = await self.payments_repo.get_group_player_info(group_player_id)
        if not player_info or str(player_info["group_id"]) != str(group_id):
            raise NotFoundError("Player", str(group_player_id))

        if player_info["membership_type"] != "SUB":
            raise BadRequestError("Payment tracking is only for sub players")

        # Record the payment (positive amount)
        payment = await self.payments_repo.record_payment(
            group_id=group_id,
            group_player_id=group_player_id,
            amount=abs(amount),  # Ensure positive
            payment_type="PAYMENT",
            notes=notes,
        )

        # Get new balance
        new_balance = await self.payments_repo.get_player_balance(group_player_id)

        return PaymentResponse(
            id=payment["id"],
            amount=payment["amount"],
            paymentType=PaymentType.PAYMENT,
            newBalance=new_balance,
            createdAt=payment["created_at"],
        )

    async def record_adjustment(
        self,
        user_id: str,
        group_id: UUID,
        group_player_id: UUID,
        amount: float,
        notes: str = None,
    ) -> PaymentResponse:
        """Record an adjustment (credit or debit) for a sub player."""
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can record adjustments")

        # Check if payment tracking is enabled
        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})
        if not payment_settings.get("trackPayments", False):
            raise BadRequestError("Payment tracking is not enabled for this group")

        # Verify player exists and is in this group
        player_info = await self.payments_repo.get_group_player_info(group_player_id)
        if not player_info or str(player_info["group_id"]) != str(group_id):
            raise NotFoundError("Player", str(group_player_id))

        # Record the adjustment (can be positive or negative)
        payment = await self.payments_repo.record_payment(
            group_id=group_id,
            group_player_id=group_player_id,
            amount=amount,
            payment_type="ADJUSTMENT",
            notes=notes,
        )

        # Get new balance
        new_balance = await self.payments_repo.get_player_balance(group_player_id)

        return PaymentResponse(
            id=payment["id"],
            amount=payment["amount"],
            paymentType=PaymentType.ADJUSTMENT,
            newBalance=new_balance,
            createdAt=payment["created_at"],
        )

    async def mark_all_paid(
        self,
        user_id: str,
        group_id: UUID,
        group_player_id: UUID,
    ) -> PaymentResponse:
        """Zero out a player's balance by recording a payment for the full amount owed."""
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can mark payments")

        # Check if payment tracking is enabled
        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})
        if not payment_settings.get("trackPayments", False):
            raise BadRequestError("Payment tracking is not enabled for this group")

        # Verify player exists and is in this group
        player_info = await self.payments_repo.get_group_player_info(group_player_id)
        if not player_info or str(player_info["group_id"]) != str(group_id):
            raise NotFoundError("Player", str(group_player_id))

        # Get current balance
        current_balance = await self.payments_repo.get_player_balance(group_player_id)

        if current_balance >= 0:
            raise BadRequestError("Player has no outstanding balance")

        # Record payment for the full amount owed (negative balance means they owe)
        amount_to_pay = abs(current_balance)

        payment = await self.payments_repo.record_payment(
            group_id=group_id,
            group_player_id=group_player_id,
            amount=amount_to_pay,
            payment_type="PAYMENT",
            notes="Marked all paid",
        )

        return PaymentResponse(
            id=payment["id"],
            amount=payment["amount"],
            paymentType=PaymentType.PAYMENT,
            newBalance=0.0,
            createdAt=payment["created_at"],
        )

    async def get_payment_history(
        self,
        user_id: str,
        group_id: UUID,
        group_player_id: UUID,
    ) -> PaymentHistoryResponse:
        """Get payment history for a specific player."""
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can view payment history")

        # Verify player exists and is in this group
        player_info = await self.payments_repo.get_group_player_info(group_player_id)
        if not player_info or str(player_info["group_id"]) != str(group_id):
            raise NotFoundError("Player", str(group_player_id))

        # Get history
        history = await self.payments_repo.get_payment_history(group_player_id)

        # Get current balance
        current_balance = await self.payments_repo.get_player_balance(group_player_id)

        return PaymentHistoryResponse(
            groupPlayerId=group_player_id,
            displayName=player_info["display_name"],
            history=[
                PaymentHistoryItem(
                    id=h["id"],
                    amount=h["amount"],
                    paymentType=PaymentType(h["payment_type"]),
                    eventId=h["event_id"],
                    eventName=h["event_name"],
                    notes=h["notes"],
                    createdAt=h["created_at"],
                )
                for h in history
            ],
            currentBalance=current_balance,
        )

    async def charge_subs_for_event(
        self,
        event_id: UUID,
        group_id: UUID,
        user_id: str,
    ) -> int:
        """
        Charge all sub participants of an event.
        
        Called when an event is completed and payment tracking is enabled.
        Returns the number of subs charged.
        """
        # Get group settings
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            return 0

        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})

        if not payment_settings.get("trackPayments", False):
            return 0

        fee_per_attendance = payment_settings.get("subFeePerAttendance", 5.0)
        if fee_per_attendance <= 0:
            return 0

        # Charge subs
        created = await self.payments_repo.charge_subs_for_event(
            event_id=event_id,
            group_id=group_id,
            fee_per_attendance=fee_per_attendance,
        )

        return len(created)

    async def backfill_historical_charges(
        self,
        user_id: str,
        group_id: UUID,
    ) -> Dict[str, Any]:
        """
        Backfill attendance charges for all completed events.
        
        Goes through all completed events in the group and creates ATTENDANCE
        charges for any sub participants who haven't been charged yet.
        
        Returns:
            Dict with events_processed, charges_created, and total_amount
        """
        # Verify group access
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))

        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can backfill charges")

        # Check if payment tracking is enabled
        settings = group.get("settings", {})
        payment_settings = settings.get("paymentSettings", {})
        if not payment_settings.get("trackPayments", False):
            raise BadRequestError("Payment tracking is not enabled for this group")

        fee_per_attendance = payment_settings.get("subFeePerAttendance", 5.0)
        if fee_per_attendance <= 0:
            raise BadRequestError("Sub fee per attendance must be greater than 0")

        # Backfill charges
        result = await self.payments_repo.backfill_historical_charges(
            group_id=group_id,
            fee_per_attendance=fee_per_attendance,
        )

        # Calculate total amount charged
        total_amount = result["charges_created"] * fee_per_attendance

        return {
            "eventsProcessed": result["events_processed"],
            "chargesCreated": result["charges_created"],
            "totalAmount": total_amount,
            "feePerAttendance": fee_per_attendance,
            "details": result["details"],
        }
