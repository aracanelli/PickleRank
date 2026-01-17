"""Repository for payment tracking operations."""
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection


class PaymentsRepository:
    """Repository for sub player payment tracking."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def record_payment(
        self,
        group_id: UUID,
        group_player_id: UUID,
        amount: float,
        payment_type: str,
        created_by: Optional[UUID] = None,
        event_id: Optional[UUID] = None,
        notes: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Record a payment transaction.
        
        Args:
            group_id: The group this payment belongs to
            group_player_id: The group player making/receiving the payment
            amount: The amount (positive for payments/credits, negative for charges)
            payment_type: ATTENDANCE, PAYMENT, or ADJUSTMENT
            created_by: Optional user UUID recording this transaction
            event_id: Optional event this charge is associated with
            notes: Optional notes about the transaction
        """
        row = await self.conn.fetchrow(
            """
            INSERT INTO sub_payments (group_id, group_player_id, amount, payment_type, event_id, notes, created_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id, group_id, group_player_id, amount, payment_type, event_id, notes, created_by, created_at
            """,
            group_id,
            group_player_id,
            amount,
            payment_type,
            event_id,
            notes,
            created_by,
        )
        return dict(row) if row else None

    async def get_sub_balances(self, group_id: UUID) -> List[Dict[str, Any]]:
        """
        Get balance summaries for all sub players in a group.
        
        Returns list with:
        - group_player_id
        - player_id
        - display_name
        - membership_type
        - total_attendances (count of ATTENDANCE records)
        - total_charges (sum of negative amounts)
        - total_payments (sum of positive amounts)
        - balance (net balance: positive = credit, negative = owes)
        - last_payment_date
        """
        rows = await self.conn.fetch(
            """
            SELECT 
                gp.id as group_player_id,
                gp.player_id,
                p.display_name,
                gp.membership_type,
                COALESCE(ps.total_attendances, 0) as total_attendances,
                COALESCE(ps.total_charges, 0) as total_charges,
                COALESCE(ps.total_payments, 0) as total_payments,
                COALESCE(ps.balance, 0) as balance,
                ps.last_payment_date
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            LEFT JOIN (
                SELECT 
                    group_player_id,
                    COUNT(*) FILTER (WHERE payment_type = 'ATTENDANCE') as total_attendances,
                    ABS(COALESCE(SUM(amount) FILTER (WHERE amount < 0), 0)) as total_charges,
                    COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) as total_payments,
                    SUM(amount) as balance,
                    MAX(created_at) FILTER (WHERE payment_type = 'PAYMENT') as last_payment_date
                FROM sub_payments
                WHERE group_id = $1
                GROUP BY group_player_id
            ) ps ON ps.group_player_id = gp.id
            WHERE gp.group_id = $1 AND gp.membership_type = 'SUB'
            ORDER BY ps.balance ASC NULLS LAST, p.display_name
            """,
            group_id,
        )
        return [dict(row) for row in rows]

    async def get_player_balance(self, group_player_id: UUID) -> float:
        """Get the current balance for a specific player."""
        result = await self.conn.fetchval(
            """
            SELECT COALESCE(SUM(amount), 0)
            FROM sub_payments
            WHERE group_player_id = $1
            """,
            group_player_id,
        )
        return float(result) if result else 0.0

    async def get_payment_history(
        self, group_player_id: UUID
    ) -> List[Dict[str, Any]]:
        """
        Get payment history for a specific player.
        
        Returns list of all transactions ordered by date descending.
        """
        rows = await self.conn.fetch(
            """
            SELECT 
                sp.id,
                sp.amount,
                sp.payment_type,
                sp.event_id,
                e.name as event_name,
                sp.notes,
                sp.created_at
            FROM sub_payments sp
            LEFT JOIN events e ON e.id = sp.event_id
            WHERE sp.group_player_id = $1
            ORDER BY sp.created_at DESC
            """,
            group_player_id,
        )
        return [dict(row) for row in rows]

    async def clear_event_charges(self, event_id: UUID) -> int:
        """
        Remove all charges associated with an event.
        
        Used when an event is deleted or uncompleted.
        Returns the number of records deleted.
        """
        result = await self.conn.execute(
            """
            DELETE FROM sub_payments
            WHERE event_id = $1 AND payment_type = 'ATTENDANCE'
            """,
            event_id,
        )
        # Result is like "DELETE 3"
        return int(result.split()[-1]) if result else 0

    async def charge_subs_for_event(
        self,
        event_id: UUID,
        group_id: UUID,
        fee_per_attendance: float,
        created_by: Optional[UUID] = None,
    ) -> List[Dict[str, Any]]:
        """
        Charge all sub participants of an event.
        
        Creates ATTENDANCE payment records for each sub player who participated.
        The amount is negative (representing a charge).
        
        Returns list of created payment records.
        """
        # Get all sub participants for this event
        sub_participants = await self.conn.fetch(
            """
            SELECT DISTINCT ep.group_player_id
            FROM event_participants ep
            JOIN group_players gp ON gp.id = ep.group_player_id
            WHERE ep.event_id = $1 AND gp.membership_type = 'SUB'
            """,
            event_id,
        )
        
        created = []
        charge_amount = -abs(fee_per_attendance)  # Ensure negative
        
        for row in sub_participants:
            group_player_id = row["group_player_id"]
            
            # Check if already charged for this event
            existing = await self.conn.fetchval(
                """
                SELECT 1 FROM sub_payments
                WHERE event_id = $1 AND group_player_id = $2 AND payment_type = 'ATTENDANCE'
                """,
                event_id,
                group_player_id,
            )
            
            if existing:
                continue  # Already charged
            
            payment = await self.record_payment(
                group_id=group_id,
                group_player_id=group_player_id,
                amount=charge_amount,
                payment_type="ATTENDANCE",
                created_by=created_by,
                event_id=event_id,
                notes=None,
            )
            created.append(payment)
        
        return created

    async def get_group_player_info(self, group_player_id: UUID) -> Optional[Dict[str, Any]]:
        """Get basic info for a group player."""
        row = await self.conn.fetchrow(
            """
            SELECT gp.id, gp.group_id, gp.player_id, gp.membership_type, p.display_name
            FROM group_players gp
            JOIN players p ON p.id = gp.player_id
            WHERE gp.id = $1
            """,
            group_player_id,
        )
        return dict(row) if row else None

    async def backfill_historical_charges(
        self,
        group_id: UUID,
        fee_per_attendance: float,
        created_by: Optional[UUID] = None,
    ) -> Dict[str, Any]:
        """
        Backfill attendance charges for all completed events.
        
        Goes through all completed events in the group and creates ATTENDANCE
        charges for any sub participants who haven't been charged yet.
        
        Returns:
            Dict with events_processed, charges_created, and details per event
        """
        # Get all completed events for this group
        completed_events = await self.conn.fetch(
            """
            SELECT id, name, starts_at
            FROM events
            WHERE group_id = $1 AND status = 'COMPLETED'
            ORDER BY starts_at ASC
            """,
            group_id,
        )
        
        events_processed = 0
        total_charges_created = 0
        event_details = []
        
        for event in completed_events:
            event_id = event["id"]
            event_name = event["name"] or "Unnamed Event"
            
            # Charge subs for this event (method already skips already-charged)
            created = await self.charge_subs_for_event(
                event_id=event_id,
                group_id=group_id,
                fee_per_attendance=fee_per_attendance,
                created_by=created_by,
            )
            
            if created:
                events_processed += 1
                total_charges_created += len(created)
                event_details.append({
                    "event_id": event_id,
                    "event_name": event_name,
                    "charges_created": len(created),
                })
        
        return {
            "events_processed": events_processed,
            "charges_created": total_charges_created,
            "details": event_details,
        }
