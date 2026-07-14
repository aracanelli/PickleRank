"""
Spond service - connect a Spond account, map groups, and resolve event
attendees to PickleRank players.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.players import GroupRole, MembershipType
from app.api.schemas.spond import (
    SpondAttendeeLinkInput,
    SpondConfirmLinksResponse,
    SpondEventDto,
    SpondEventListResponse,
    SpondGroupDto,
    SpondGroupLinkResponse,
    SpondGroupListResponse,
    SpondResolvedAttendeeDto,
    SpondResolveResponse,
    SpondStatusResponse,
)
from app.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import (
    GroupPlayersRepository,
    PlayersRepository,
)
from app.infrastructure.repositories.spond_repo import SpondRepository
from app.infrastructure.spond.client import SpondAuthError, SpondClient
from app.infrastructure.spond.crypto import decrypt_secret, encrypt_secret
from app.logging_config import get_logger

logger = get_logger(__name__)

# Refresh a cached token slightly before it actually expires.
_TOKEN_SKEW = timedelta(minutes=2)


def _normalize_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


class SpondService:
    """Service for Spond integration operations."""

    def __init__(self, conn: Connection, client: Optional[SpondClient] = None):
        self.conn = conn
        self.spond_repo = SpondRepository(conn)
        self.groups_repo = GroupsRepository(conn)
        self.players_repo = PlayersRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.client = client or SpondClient()

    # ----- account connection -----

    async def connect(self, user_id: str, email: str, password: str) -> SpondStatusResponse:
        """Validate credentials against Spond, then store them encrypted."""
        token, expiration = await self.client.login(email, password)
        encrypted = encrypt_secret(password)
        await self.spond_repo.upsert_account(
            user_id=user_id,
            spond_email=email,
            encrypted_credentials=encrypted,
            access_token=token,
            token_expires_at=expiration,
        )
        return SpondStatusResponse(connected=True, email=email)

    async def get_status(self, user_id: str) -> SpondStatusResponse:
        account = await self.spond_repo.get_account(user_id)
        if not account:
            return SpondStatusResponse(connected=False, email=None)
        return SpondStatusResponse(connected=True, email=account["spond_email"])

    async def disconnect(self, user_id: str) -> None:
        await self.spond_repo.delete_account(user_id)

    async def _require_account(self, user_id: str) -> Dict[str, Any]:
        account = await self.spond_repo.get_account(user_id)
        if not account:
            raise BadRequestError(
                "No Spond account is connected. Connect one in account settings first."
            )
        return account

    async def _get_valid_token(self, user_id: str, account: Dict[str, Any]) -> str:
        """Return a usable token, re-authenticating with stored credentials if needed."""
        token = account.get("access_token")
        expires_at = account.get("token_expires_at")
        now = datetime.now(timezone.utc)
        if token and expires_at and expires_at - _TOKEN_SKEW > now:
            return token

        # Cached token missing or (near-)expired: re-login using stored credentials.
        password = decrypt_secret(account["encrypted_credentials"])
        try:
            token, expiration = await self.client.login(account["spond_email"], password)
        except SpondAuthError:
            # Stored password no longer valid (e.g. changed on Spond's side).
            raise BadRequestError(
                "Your saved Spond credentials are no longer valid. Please reconnect your Spond account."
            )
        await self.spond_repo.update_cached_token(user_id, token, expiration)
        return token

    async def _token_with_retry(self, user_id: str, account: Dict[str, Any], call):
        """Run an authed client call, refreshing the token once on a session-expiry error."""
        token = await self._get_valid_token(user_id, account)
        try:
            return await call(token)
        except SpondAuthError:
            # Force a fresh login and retry once.
            account = {**account, "access_token": None, "token_expires_at": None}
            token = await self._get_valid_token(user_id, account)
            return await call(token)

    # ----- authorization -----

    async def _require_group_manager(self, user_id: str, group_id: UUID) -> Dict[str, Any]:
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        is_owner = str(group.get("owner_user_id", "")) == user_id
        if not is_owner and not await self.group_players_repo.is_organizer(user_id, group_id):
            raise ForbiddenError("Only owners and organizers can use Spond for this group")
        return group

    # ----- spond groups & mapping -----

    async def list_spond_groups(self, user_id: str) -> SpondGroupListResponse:
        account = await self._require_account(user_id)
        groups = await self._token_with_retry(
            user_id, account, lambda t: self.client.list_groups(t)
        )
        return SpondGroupListResponse(
            groups=[
                SpondGroupDto(
                    spondGroupId=g["spond_group_id"],
                    name=g["name"],
                    memberCount=g["member_count"],
                )
                for g in groups
                if g.get("spond_group_id")
            ]
        )

    async def get_group_link(self, user_id: str, group_id: UUID) -> SpondGroupLinkResponse:
        await self._require_group_manager(user_id, group_id)
        link = await self.spond_repo.get_group_link(group_id)
        if not link:
            return SpondGroupLinkResponse(linked=False)
        return SpondGroupLinkResponse(
            linked=True,
            spondGroupId=link["spond_group_id"],
            spondGroupName=link.get("spond_group_name"),
        )

    async def link_group(
        self, user_id: str, group_id: UUID, spond_group_id: str
    ) -> SpondGroupLinkResponse:
        await self._require_group_manager(user_id, group_id)
        account = await self._require_account(user_id)
        groups = await self._token_with_retry(
            user_id, account, lambda t: self.client.list_groups(t)
        )
        match = next((g for g in groups if g["spond_group_id"] == spond_group_id), None)
        if not match:
            raise BadRequestError("That Spond group was not found in your account.")
        link = await self.spond_repo.upsert_group_link(
            group_id=group_id,
            spond_group_id=spond_group_id,
            spond_group_name=match["name"],
            linked_by_user_id=user_id,
        )
        return SpondGroupLinkResponse(
            linked=True,
            spondGroupId=link["spond_group_id"],
            spondGroupName=link.get("spond_group_name"),
        )

    # ----- events -----

    async def list_events(self, user_id: str, group_id: UUID) -> SpondEventListResponse:
        await self._require_group_manager(user_id, group_id)
        account = await self._require_account(user_id)
        link = await self.spond_repo.get_group_link(group_id)
        if not link:
            raise BadRequestError("This group is not linked to a Spond group yet.")
        events = await self._token_with_retry(
            user_id,
            account,
            lambda t: self.client.list_upcoming_events(t, link["spond_group_id"]),
        )
        return SpondEventListResponse(
            events=[
                SpondEventDto(
                    spondEventId=e["spond_event_id"],
                    name=e["name"],
                    startsAt=e.get("starts_at"),
                    acceptedCount=e["accepted_count"],
                )
                for e in events
                if e.get("spond_event_id")
            ]
        )

    async def resolve_event(
        self, user_id: str, group_id: UUID, spond_event_id: str
    ) -> SpondResolveResponse:
        """Map an event's accepted attendees to this group's roster."""
        await self._require_group_manager(user_id, group_id)
        account = await self._require_account(user_id)
        link = await self.spond_repo.get_group_link(group_id)
        if not link:
            raise BadRequestError("This group is not linked to a Spond group yet.")

        attendees = await self._token_with_retry(
            user_id,
            account,
            lambda t: self.client.get_event_attendees(t, link["spond_group_id"], spond_event_id),
        )

        # Build lookup tables from the current roster and saved links.
        roster = await self.group_players_repo.list_by_group(group_id)
        gp_by_player_id = {str(gp["player_id"]): gp for gp in roster}
        gp_by_norm_name = {_normalize_name(gp["display_name"]): gp for gp in roster}

        member_links = await self.spond_repo.get_member_links(group_id)
        player_id_by_member = {ml["spond_member_id"]: str(ml["player_id"]) for ml in member_links}

        resolved: List[SpondResolvedAttendeeDto] = []
        matched_ids: List[UUID] = []
        for att in attendees:
            member_id = att["spond_member_id"]
            name = att["name"]
            matched_gp_id: Optional[UUID] = None
            suggested_gp_id: Optional[UUID] = None

            # 1) Existing saved link -> roster player.
            linked_player_id = player_id_by_member.get(member_id)
            if linked_player_id and linked_player_id in gp_by_player_id:
                matched_gp_id = gp_by_player_id[linked_player_id]["id"]
            else:
                # 2) Best-guess by exact (normalized) display name.
                suggestion = gp_by_norm_name.get(_normalize_name(name))
                if suggestion:
                    suggested_gp_id = suggestion["id"]

            if matched_gp_id is not None:
                matched_ids.append(matched_gp_id)

            resolved.append(
                SpondResolvedAttendeeDto(
                    spondMemberId=member_id,
                    name=name,
                    matchedGroupPlayerId=matched_gp_id,
                    suggestedGroupPlayerId=suggested_gp_id,
                )
            )

        return SpondResolveResponse(attendees=resolved, matchedGroupPlayerIds=matched_ids)

    async def confirm_links(
        self,
        user_id: str,
        group_id: UUID,
        links: List[SpondAttendeeLinkInput],
    ) -> SpondConfirmLinksResponse:
        """Persist attendee -> player links (creating players as needed) and
        return the resulting group_player IDs to select."""
        group = await self._require_group_manager(user_id, group_id)

        roster = await self.group_players_repo.list_by_group(group_id)
        gp_by_id = {str(gp["id"]): gp for gp in roster}
        gp_by_player_id = {str(gp["player_id"]): gp for gp in roster}

        owner_user_id = str(group["owner_user_id"])
        base_rating = group["settings"].get("initialRating", 1000)

        result_group_player_ids: List[UUID] = []

        for link in links:
            member_id = link.spond_member_id

            if link.group_player_id is not None:
                gp = gp_by_id.get(str(link.group_player_id))
                if not gp:
                    raise BadRequestError(
                        f"Selected player is not in this group (attendee {member_id})."
                    )
                player_id = gp["player_id"]
                group_player_id = gp["id"]
            elif link.create_name and link.create_name.strip():
                # Create a new global player owned by the group owner, add to group.
                new_player = await self.players_repo.create(
                    owner_user_id=owner_user_id,
                    display_name=link.create_name.strip(),
                )
                player_id = new_player["id"]
                gp = await self.group_players_repo.add_player_to_group(
                    group_id=group_id,
                    player_id=player_id,
                    initial_rating=base_rating,
                    membership_type=MembershipType.PERMANENT.value,
                    role=GroupRole.PLAYER.value,
                )
                group_player_id = gp["id"]
                gp_by_player_id[str(player_id)] = {"id": group_player_id, "player_id": player_id}
            else:
                raise BadRequestError(
                    f"Each attendee must map to a player or provide a new name (attendee {member_id})."
                )

            await self.spond_repo.upsert_member_link(group_id, member_id, player_id)
            result_group_player_ids.append(group_player_id)

        return SpondConfirmLinksResponse(groupPlayerIds=result_group_player_ids)
