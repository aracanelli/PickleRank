"""
Player service - handles player-related use cases.
"""
from typing import List, Optional
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.players import (
    BulkAddPlayersToGroupRequest,
    BulkAddPlayersToGroupResponse,
    BulkPlayerCreate,
    BulkPlayerCreateResponse,
    GroupPlayerResponse,
    MembershipType,
    PlayerCreate,
    PlayerResponse,
    PlayerUpdate,
    SkillLevel,
    UpdateGroupPlayerRequest,
)
from app.exceptions import BadRequestError, ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import (
    GroupPlayersRepository,
    PlayersRepository,
)


class PlayerService:
    """Service for player operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.players_repo = PlayersRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.groups_repo = GroupsRepository(conn)

    async def create_player(self, user_id: str, data: PlayerCreate) -> PlayerResponse:
        """Create a new global player."""
        player = await self.players_repo.create(
            owner_user_id=user_id,
            display_name=data.display_name,
            notes=data.notes,
        )

        return PlayerResponse(
            id=player["id"],
            displayName=player["display_name"],
            notes=player["notes"],
            created_at=player["created_at"],
        )

    async def bulk_create_players(
        self, user_id: str, data: BulkPlayerCreate
    ) -> BulkPlayerCreateResponse:
        """Create multiple players at once."""
        # Clean and deduplicate names
        names = list(dict.fromkeys([n.strip() for n in data.names if n.strip()]))

        if not names:
            raise BadRequestError("No valid player names provided")

        if len(names) > 100:
            raise BadRequestError("Cannot create more than 100 players at once")

        created_players, skipped_names = await self.players_repo.create_bulk(
            owner_user_id=user_id,
            names=names,
        )

        return BulkPlayerCreateResponse(
            created=[
                PlayerResponse(
                    id=p["id"],
                    displayName=p["display_name"],
                    notes=p["notes"],
                    created_at=p["created_at"],
                )
                for p in created_players
            ],
            skipped=skipped_names,
            errors=[],
        )

    async def list_players(
        self, user_id: str, search: Optional[str] = None
    ) -> List[PlayerResponse]:
        """List all global players for a user."""
        players = await self.players_repo.list_by_owner(user_id, search)
        return [
            PlayerResponse(
                id=p["id"],
                displayName=p["display_name"],
                notes=p["notes"],
                created_at=p["created_at"],
            )
            for p in players
        ]

    async def get_player(self, user_id: str, player_id: UUID) -> PlayerResponse:
        """Get a specific player."""
        player = await self.players_repo.get_by_id(player_id)

        if not player:
            raise NotFoundError("Player", str(player_id))

        if str(player["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this player")

        return PlayerResponse(
            id=player["id"],
            displayName=player["display_name"],
            notes=player["notes"],
            created_at=player["created_at"],
        )

    async def update_player(
        self, user_id: str, player_id: UUID, data: PlayerUpdate
    ) -> PlayerResponse:
        """Update a player."""
        # Verify ownership
        player = await self.players_repo.get_by_id(player_id)

        if not player:
            raise NotFoundError("Player", str(player_id))

        if str(player["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this player")

        # Update
        updated = await self.players_repo.update(
            player_id=player_id,
            display_name=data.display_name,
            notes=data.notes,
        )

        return PlayerResponse(
            id=updated["id"],
            displayName=updated["display_name"],
            notes=updated["notes"],
            created_at=updated["created_at"],
        )

    async def add_player_to_group(
        self,
        user_id: str,
        group_id: UUID,
        player_id: UUID,
        membership_type: MembershipType = MembershipType.PERMANENT,
        skill_level: Optional[SkillLevel] = None,
    ) -> GroupPlayerResponse:
        """Add a player to a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Verify player ownership
        player = await self.players_repo.get_by_id(player_id)

        if not player:
            raise NotFoundError("Player", str(player_id))

        if str(player["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this player")

        # Get initial rating from group settings
        base_rating = group["settings"].get("initialRating", 1000)
        
        # Calculate starting rating based on skill level for subs
        # Base offsets: ADVANCED +100, INTERMEDIATE 0, BEGINNER -100
        # These scale with base rating (offset = (base/1000) * 100)
        initial_rating = base_rating
        if membership_type == MembershipType.SUB and skill_level:
            offset_multiplier = base_rating / 1000
            if skill_level == SkillLevel.ADVANCED:
                initial_rating = base_rating + int(100 * offset_multiplier)
            elif skill_level == SkillLevel.BEGINNER:
                initial_rating = base_rating - int(100 * offset_multiplier)
            # INTERMEDIATE stays at base_rating

        # Add to group
        group_player = await self.group_players_repo.add_player_to_group(
            group_id=group_id,
            player_id=player_id,
            initial_rating=initial_rating,
            membership_type=membership_type.value,
            skill_level=skill_level.value if skill_level else None,
        )

        # Get full info
        gp = await self.group_players_repo.get_by_id(group_player["id"])

        return self._to_group_player_response(gp)

    async def bulk_add_players_to_group(
        self,
        user_id: str,
        group_id: UUID,
        data: BulkAddPlayersToGroupRequest,
    ) -> BulkAddPlayersToGroupResponse:
        """Add multiple players to a group at once."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Verify all players are owned by this user
        player_ids = [p.player_id for p in data.players]
        for player_id in player_ids:
            player = await self.players_repo.get_by_id(player_id)
            if not player:
                raise NotFoundError("Player", str(player_id))
            if str(player["owner_user_id"]) != user_id:
                raise ForbiddenError(f"You don't own player {player_id}")

        # Get base rating from group settings
        base_rating = group["settings"].get("initialRating", 1000)

        # Prepare player data for bulk add with skill-based ratings
        players_data = []
        for p in data.players:
            # Calculate starting rating based on skill level for subs
            initial_rating = base_rating
            if p.membership_type == MembershipType.SUB and p.skill_level:
                offset_multiplier = base_rating / 1000
                if p.skill_level == SkillLevel.ADVANCED:
                    initial_rating = base_rating + int(100 * offset_multiplier)
                elif p.skill_level == SkillLevel.BEGINNER:
                    initial_rating = base_rating - int(100 * offset_multiplier)
                # INTERMEDIATE stays at base_rating
            
            players_data.append({
                "player_id": p.player_id, 
                "membership_type": p.membership_type.value,
                "initial_rating": initial_rating,
                "skill_level": p.skill_level.value if p.skill_level else None,
            })

        # Bulk add
        added_players, skipped_ids = await self.group_players_repo.bulk_add_players_to_group(
            group_id=group_id,
            players=players_data,
        )

        # Get full info for added players
        added_responses = []
        for gp in added_players:
            full_gp = await self.group_players_repo.get_by_id(gp["id"])
            added_responses.append(self._to_group_player_response(full_gp))

        return BulkAddPlayersToGroupResponse(
            added=added_responses,
            skipped=skipped_ids,
        )

    async def update_group_player(
        self,
        user_id: str,
        group_id: UUID,
        group_player_id: UUID,
        data: UpdateGroupPlayerRequest,
    ) -> GroupPlayerResponse:
        """Update a group player's membership type and/or skill level."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Verify group player exists and belongs to this group
        gp = await self.group_players_repo.get_by_id(group_player_id)

        if not gp:
            raise NotFoundError("GroupPlayer", str(group_player_id))

        if gp["group_id"] != group_id:
            raise ForbiddenError("This player doesn't belong to this group")

        # Update membership type and/or skill level
        new_membership_type = data.membership_type.value if data.membership_type else None
        new_skill_level = data.skill_level.value if data.skill_level else None
        
        await self.group_players_repo.update_group_player(
            group_player_id=group_player_id,
            membership_type=new_membership_type,
            skill_level=new_skill_level,
        )

        # Get full info
        full_gp = await self.group_players_repo.get_by_id(group_player_id)

        return self._to_group_player_response(full_gp)

    async def list_group_players(
        self, user_id: str, group_id: UUID
    ) -> List[GroupPlayerResponse]:
        """List all players in a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Get players
        players = await self.group_players_repo.list_by_group(group_id)

        return [self._to_group_player_response(p) for p in players]

    async def remove_player_from_group(
        self, user_id: str, group_id: UUID, group_player_id: UUID
    ) -> None:
        """Remove a player from a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Remove
        removed = await self.group_players_repo.remove_from_group(
            group_id, group_player_id
        )

        if not removed:
            raise NotFoundError("GroupPlayer", str(group_player_id))

    def _to_group_player_response(self, gp: dict) -> GroupPlayerResponse:
        """Convert a group player dict to a response."""
        win_rate = gp.get("win_rate", 0)
        if win_rate is None and gp["games_played"] > 0:
            win_rate = (gp["wins"] + 0.5 * gp["ties"]) / gp["games_played"]
        elif win_rate is None:
            win_rate = 0

        # Handle membership_type - convert from DB string if needed
        membership_type = gp.get("membership_type", "PERMANENT")
        if isinstance(membership_type, str):
            membership_type = MembershipType(membership_type)
        
        # Handle skill_level - convert from DB string if needed
        skill_level = gp.get("skill_level")
        if skill_level is not None and isinstance(skill_level, str):
            skill_level = SkillLevel(skill_level)

        return GroupPlayerResponse(
            id=gp["id"],
            playerId=gp["player_id"],
            groupId=gp["group_id"],
            displayName=gp["display_name"],
            membershipType=membership_type,
            skillLevel=skill_level,
            rating=float(gp["rating"]),
            gamesPlayed=gp["games_played"],
            wins=gp["wins"],
            losses=gp["losses"],
            ties=gp["ties"],
            winRate=float(win_rate),
        )




