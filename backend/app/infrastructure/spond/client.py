"""
Minimal async client for Spond's (unofficial) core API.

Spond does not publish an official API and the mature community library
(Olen/Spond) is GPL-3.0, so this project implements the small set of endpoints
it needs directly with httpx to avoid the licensing implications of importing it.

Endpoints (base https://api.spond.com/core/v1/):
  - POST auth2/login        {email, password} -> accessToken.token (+ expiration)
  - GET  groups/            -> [{id, name, members:[{id, firstName, lastName, ...}]}]
  - GET  sponds/?groupId=.. -> upcoming events with responses.acceptedIds

Only reading is performed; nothing is written back to Spond.
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx

from app.exceptions import AppException
from app.logging_config import get_logger

logger = get_logger(__name__)

SPOND_API_BASE = "https://api.spond.com/core/v1/"
_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


class SpondAuthError(AppException):
    """Spond rejected the supplied credentials (or requires 2FA)."""

    def __init__(self, detail: str = "Spond login failed. Check your email and password."):
        super().__init__(status_code=401, detail=detail)


class SpondApiError(AppException):
    """Spond returned an unexpected error."""

    def __init__(self, detail: str = "Spond request failed. Please try again later."):
        super().__init__(status_code=502, detail=detail)


class SpondClient:
    """Stateless wrapper around the Spond core API. Pass a token to authed calls."""

    def __init__(self, base_url: str = SPOND_API_BASE):
        self.base_url = base_url

    @staticmethod
    def _auth_headers(token: str) -> Dict[str, str]:
        return {"content-type": "application/json", "Authorization": f"Bearer {token}"}

    async def login(self, email: str, password: str) -> Tuple[str, Optional[datetime]]:
        """Authenticate and return (access_token, expiration).

        Raises SpondAuthError on bad credentials / 2FA challenge.
        """
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=_TIMEOUT) as client:
                resp = await client.post("auth2/login", json={"email": email, "password": password})
        except httpx.HTTPError as exc:
            logger.warning("Spond login network error: %s", exc)
            raise SpondApiError("Could not reach Spond. Please try again later.") from exc

        if resp.status_code in (400, 401, 403):
            raise SpondAuthError()

        if resp.status_code >= 400:
            logger.warning("Spond login unexpected status %s", resp.status_code)
            raise SpondApiError()

        data = resp.json()
        access = data.get("accessToken") or {}
        token = access.get("token")
        if not token:
            # A missing token typically means a 2FA/verification challenge.
            raise SpondAuthError(
                "Spond login did not return an access token. Accounts with two-factor "
                "authentication enabled cannot be connected."
            )

        expiration = _parse_ts(access.get("expiration"))
        return token, expiration

    async def _get(self, token: str, path: str, params: Optional[Dict[str, Any]] = None) -> Any:
        try:
            async with httpx.AsyncClient(base_url=self.base_url, timeout=_TIMEOUT) as client:
                resp = await client.get(path, params=params, headers=self._auth_headers(token))
        except httpx.HTTPError as exc:
            logger.warning("Spond GET %s network error: %s", path, exc)
            raise SpondApiError("Could not reach Spond. Please try again later.") from exc

        if resp.status_code in (401, 403):
            # Token likely expired; surface so the caller can re-login.
            raise SpondAuthError("Spond session expired.")
        if resp.status_code >= 400:
            logger.warning("Spond GET %s status %s", path, resp.status_code)
            raise SpondApiError()
        return resp.json()

    async def list_groups(self, token: str) -> List[Dict[str, Any]]:
        """Return the organizer's Spond groups with their members."""
        data = await self._get(token, "groups/")
        groups: List[Dict[str, Any]] = []
        for g in data or []:
            members = [
                {
                    "spond_member_id": m.get("id"),
                    "first_name": m.get("firstName") or "",
                    "last_name": m.get("lastName") or "",
                    "email": m.get("email"),
                }
                for m in (g.get("members") or [])
                if m.get("id")
            ]
            groups.append(
                {
                    "spond_group_id": g.get("id"),
                    "name": g.get("name") or "Unnamed group",
                    "member_count": len(members),
                    "members": members,
                }
            )
        return groups

    async def _get_group(self, token: str, spond_group_id: str) -> Optional[Dict[str, Any]]:
        for g in await self.list_groups(token):
            if g["spond_group_id"] == spond_group_id:
                return g
        return None

    async def list_upcoming_events(
        self, token: str, spond_group_id: str, max_events: int = 50
    ) -> List[Dict[str, Any]]:
        """Return upcoming events for a Spond group, soonest first."""
        now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")
        params = {
            "groupId": spond_group_id,
            "max": max_events,
            "minEndTimestamp": now_iso,
            "order": "asc",
            "scheduled": "true",
        }
        data = await self._get(token, "sponds/", params=params)
        events: List[Dict[str, Any]] = []
        for e in data or []:
            responses = e.get("responses") or {}
            accepted = [i for i in (responses.get("acceptedIds") or []) if i]
            events.append(
                {
                    "spond_event_id": e.get("id"),
                    "name": e.get("heading") or e.get("name") or "Untitled event",
                    "starts_at": e.get("startTimestamp"),
                    "accepted_count": len(accepted),
                    "accepted_ids": accepted,
                }
            )
        # Defensive re-sort by start time (API order param is best-effort).
        events.sort(key=lambda ev: ev.get("starts_at") or "")
        return events

    async def get_event_attendees(
        self, token: str, spond_group_id: str, spond_event_id: str
    ) -> List[Dict[str, Any]]:
        """Return accepted attendees of an event as {spond_member_id, name, email}.

        Names are resolved against the group's member roster.
        """
        group = await self._get_group(token, spond_group_id)
        members_by_id = {m["spond_member_id"]: m for m in (group.get("members") if group else [])}

        events = await self.list_upcoming_events(token, spond_group_id)
        event = next((ev for ev in events if ev["spond_event_id"] == spond_event_id), None)
        if event is None:
            # Fall back to a direct fetch (event may be outside the upcoming window).
            single = await self._get(token, f"sponds/{spond_event_id}")
            responses = (single or {}).get("responses") or {}
            accepted_ids = [i for i in (responses.get("acceptedIds") or []) if i]
        else:
            accepted_ids = event["accepted_ids"]

        attendees: List[Dict[str, Any]] = []
        for member_id in accepted_ids:
            m = members_by_id.get(member_id)
            if m:
                name = f"{m['first_name']} {m['last_name']}".strip() or "Unnamed"
                email = m.get("email")
            else:
                name = "Unnamed"
                email = None
            attendees.append({"spond_member_id": member_id, "name": name, "email": email})
        return attendees


def _parse_ts(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
