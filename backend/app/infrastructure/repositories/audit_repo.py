import json
from typing import Any, Dict, Optional
from uuid import UUID

from asyncpg import Connection


class AuditRepository:
    """Repository for audit logging."""

    def __init__(self, conn: Connection):
        self.conn = conn

    async def log(
        self,
        actor_user_id: str,
        action: str,
        group_id: Optional[UUID] = None,
        event_id: Optional[UUID] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Log an audit entry."""
        await self.conn.execute(
            """
            INSERT INTO audit_logs (actor_user_id, action, group_id, event_id, payload)
            VALUES ($1, $2, $3, $4, $5)
            """,
            UUID(actor_user_id),
            action,
            group_id,
            event_id,
            json.dumps(payload) if payload else None,
        )




