"""Award service - orchestrates the Awards feature endpoints."""
from typing import Any, Dict, List, Optional
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.awards import (
    AwardCategoryDto,
    AwardEditionDto,
    AwardEditionStatus,
    AwardResultDto,
    VoteResponse,
)
from app.exceptions import (
    BadRequestError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
)
from app.infrastructure.repositories.awards_repo import AwardsRepository
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository


class AwardService:
    """Service for the Awards feature (editions, categories, voting, results)."""

    # Allowed status transitions per the frozen contract.
    _ALLOWED_TRANSITIONS = {
        "DRAFT": {"VOTING_OPEN"},
        "VOTING_OPEN": {"CLOSED"},
        "CLOSED": {"VOTING_OPEN"},
    }

    def __init__(self, conn: Connection):
        self.conn = conn
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.awards_repo = AwardsRepository(conn)

    # ------------------------------------------------------------------
    # Permission helpers
    # ------------------------------------------------------------------

    async def _is_owner_or_organizer(self, user_id: str, group: dict) -> bool:
        """Check if the user is the group owner or has ORGANIZER role."""
        if str(group["owner_user_id"]) == user_id:
            return True
        return await self.group_players_repo.is_organizer(user_id, group["id"])

    async def _require_group(self, group_id: UUID) -> dict:
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        return group

    async def _require_organizer(self, user_id: str, group: dict) -> None:
        if not await self._is_owner_or_organizer(user_id, group):
            raise ForbiddenError("Only owners and organizers can manage awards")

    async def _require_member(self, user_id: str, group: dict) -> None:
        """Owner or a user linked to a player in the group."""
        if str(group["owner_user_id"]) == user_id:
            return
        if not await self.group_players_repo.is_member(user_id, group["id"]):
            raise ForbiddenError("You do not have access to this group")

    def _validate_transition(self, current: str, new: str) -> None:
        if new not in self._ALLOWED_TRANSITIONS.get(current, set()):
            raise BadRequestError(
                f"Invalid status transition from {current} to {new}"
            )

    # ------------------------------------------------------------------
    # DTO assembly
    # ------------------------------------------------------------------

    async def _build_edition_dto(
        self, group: dict, edition: dict, user_id: str
    ) -> AwardEditionDto:
        group_id = group["id"]
        status = edition["status"]
        edition_id = edition["id"]

        categories = await self.awards_repo.list_categories(edition_id)

        # Resolve the caller's linked player for this group (used for myVote + canVote).
        voter_gp_id = await self.awards_repo.resolve_group_player_id(user_id, group_id)
        can_vote = status == AwardEditionStatus.VOTING_OPEN.value and voter_gp_id is not None

        my_votes: Dict[UUID, UUID] = {}
        if voter_gp_id is not None:
            my_votes = await self.awards_repo.get_my_votes(edition_id, voter_gp_id)

        # Results/tallies are assembled ONLY when the edition is CLOSED.
        results_by_cat: Dict[UUID, List[Dict[str, Any]]] = {}
        if status == AwardEditionStatus.CLOSED.value:
            results_by_cat = await self.awards_repo.get_results(edition_id)

        category_dtos: List[AwardCategoryDto] = []
        for cat in categories:
            cat_id = cat["id"]
            kwargs: Dict[str, Any] = {
                "id": cat_id,
                "title": cat["title"],
                "description": cat["description"],
                "myVote": my_votes.get(cat_id),
            }
            if status == AwardEditionStatus.CLOSED.value:
                res = results_by_cat.get(cat_id, [])
                kwargs["results"] = [
                    AwardResultDto(
                        nomineeGroupPlayerId=r["nominee_group_player_id"],
                        displayName=r["display_name"],
                        votes=r["votes"],
                    )
                    for r in res
                ]
                kwargs["totalVotes"] = sum(r["votes"] for r in res)
            category_dtos.append(AwardCategoryDto(**kwargs))

        return AwardEditionDto(
            id=edition_id,
            title=edition["title"],
            status=AwardEditionStatus(status),
            statAwards=edition.get("stat_awards") or [],
            categories=category_dtos,
            canVote=can_vote,
            createdAt=edition["created_at"],
        )

    # ------------------------------------------------------------------
    # Endpoints
    # ------------------------------------------------------------------

    async def get_awards(
        self, user_id: str, group_id: UUID
    ) -> Optional[AwardEditionDto]:
        """GET latest edition for a group (owner or member); None if none exist."""
        group = await self._require_group(group_id)
        await self._require_member(user_id, group)

        edition = await self.awards_repo.get_latest_edition(group_id)
        if not edition:
            return None
        return await self._build_edition_dto(group, edition, user_id)

    async def create_edition(
        self,
        user_id: str,
        group_id: UUID,
        title: str,
        stat_awards: List[Dict[str, Any]],
    ) -> AwardEditionDto:
        """POST create a DRAFT edition (organizer)."""
        group = await self._require_group(group_id)
        await self._require_organizer(user_id, group)

        edition = await self.awards_repo.create_edition(group_id, title, stat_awards)
        return await self._build_edition_dto(group, edition, user_id)

    async def update_edition(
        self,
        user_id: str,
        group_id: UUID,
        edition_id: UUID,
        title: Optional[str],
        status: Optional[AwardEditionStatus],
    ) -> AwardEditionDto:
        """PATCH title/status (organizer) with transition validation."""
        group = await self._require_group(group_id)
        await self._require_organizer(user_id, group)

        edition = await self.awards_repo.get_edition(edition_id)
        if not edition or str(edition["group_id"]) != str(group_id):
            raise NotFoundError("Award edition", str(edition_id))

        new_status = status.value if status is not None else None
        if new_status is not None and new_status != edition["status"]:
            self._validate_transition(edition["status"], new_status)
            # Opening voting requires at least one category.
            if edition["status"] == "DRAFT" and new_status == "VOTING_OPEN":
                categories = await self.awards_repo.list_categories(edition_id)
                if len(categories) < 1:
                    raise BadRequestError(
                        "Add at least one voting category before opening voting"
                    )

        updated = await self.awards_repo.update_edition(
            edition_id, title=title, status=new_status
        )
        return await self._build_edition_dto(group, updated, user_id)

    async def add_category(
        self,
        user_id: str,
        group_id: UUID,
        edition_id: UUID,
        title: str,
        description: Optional[str],
    ) -> AwardCategoryDto:
        """POST add a voting category to an edition (organizer)."""
        group = await self._require_group(group_id)
        await self._require_organizer(user_id, group)

        edition = await self.awards_repo.get_edition(edition_id)
        if not edition or str(edition["group_id"]) != str(group_id):
            raise NotFoundError("Award edition", str(edition_id))

        category = await self.awards_repo.add_category(edition_id, title, description)
        return AwardCategoryDto(
            id=category["id"],
            title=category["title"],
            description=category["description"],
        )

    async def delete_category(
        self, user_id: str, group_id: UUID, category_id: UUID
    ) -> None:
        """DELETE a category (organizer)."""
        group = await self._require_group(group_id)
        await self._require_organizer(user_id, group)

        category = await self.awards_repo.get_category(category_id)
        if not category or str(category["group_id"]) != str(group_id):
            raise NotFoundError("Award category", str(category_id))

        await self.awards_repo.delete_category(category_id)

    async def delete_edition(
        self, user_id: str, group_id: UUID, edition_id: UUID
    ) -> None:
        """DELETE an edition (organizer)."""
        group = await self._require_group(group_id)
        await self._require_organizer(user_id, group)

        edition = await self.awards_repo.get_edition(edition_id)
        if not edition or str(edition["group_id"]) != str(group_id):
            raise NotFoundError("Award edition", str(edition_id))

        await self.awards_repo.delete_edition(edition_id)

    async def vote(
        self,
        user_id: str,
        group_id: UUID,
        category_id: UUID,
        nominee_gp_id: UUID,
    ) -> VoteResponse:
        """POST cast/update a vote (member with a linked player, edition VOTING_OPEN)."""
        group = await self._require_group(group_id)
        await self._require_member(user_id, group)

        category = await self.awards_repo.get_category(category_id)
        if not category or str(category["group_id"]) != str(group_id):
            raise NotFoundError("Award category", str(category_id))

        # Only VOTING_OPEN editions accept votes.
        if category["edition_status"] != AwardEditionStatus.VOTING_OPEN.value:
            raise ConflictError("Voting is not open for this award edition")

        # Resolve the caller's group_player row; required to vote.
        voter_gp_id = await self.awards_repo.resolve_group_player_id(user_id, group_id)
        if voter_gp_id is None:
            raise ConflictError("Link your player to vote")

        # Validate the nominee belongs to the group.
        if not await self.awards_repo.nominee_in_group(nominee_gp_id, group_id):
            raise BadRequestError("Nominee is not a member of this group")

        async with self.conn.transaction():
            await self.awards_repo.upsert_vote(category_id, voter_gp_id, nominee_gp_id)

        return VoteResponse(ok=True, myVote=nominee_gp_id)
