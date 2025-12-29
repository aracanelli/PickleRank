"""
Player service - handles player-related use cases.
"""
from typing import List, Optional
from uuid import UUID

import asyncpg
from asyncpg import Connection

from app.api.schemas.players import (
    BulkAddPlayersToGroupRequest,
    BulkAddPlayersToGroupResponse,
    BulkPlayerCreate,
    BulkPlayerCreateResponse,
    GroupPlayerResponse,
    GroupRole,
    MembershipType,
    PlayerCreate,
    PlayerResponse,
    PlayerUpdate,
    SkillLevel,
    UpdateGroupPlayerRequest,
)
from app.exceptions import BadRequestError, ConflictError, ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import (
    GroupPlayersRepository,
    PlayersRepository,
)
from app.infrastructure.repositories.rating_updates_repo import RatingUpdatesRepository


class PlayerService:
    """Service for player operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.players_repo = PlayersRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)
        self.groups_repo = GroupsRepository(conn)
        self.rating_updates_repo = RatingUpdatesRepository(conn)

    async def create_player(self, user_id: str, data: PlayerCreate) -> PlayerResponse:
        """Create a new global player."""
        player = await self.players_repo.create(
            owner_user_id=user_id,
            display_name=data.display_name,
            notes=data.notes,
        )

        return self._to_player_response(player)

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
                self._to_player_response(p)
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
            self._to_player_response(p)
            for p in players
        ]

    async def get_player(self, user_id: str, player_id: UUID) -> PlayerResponse:
        """Get a specific player."""
        player = await self.players_repo.get_by_id(player_id)

        if not player:
            raise NotFoundError("Player", str(player_id))

        if str(player["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this player")

        return self._to_player_response(player)

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

        return self._to_player_response(updated)

    async def add_player_to_group(
        self,
        user_id: str,
        group_id: UUID,
        player_id: UUID,
        membership_type: MembershipType = MembershipType.PERMANENT,
        skill_level: Optional[SkillLevel] = None,
        role: GroupRole = GroupRole.PLAYER,
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
            elif skill_level == SkillLevel.BEGINNER:
                initial_rating = base_rating - int(100 * offset_multiplier)
            # INTERMEDIATE stays at base_rating

        # If the player is linked to the group owner, make them an organizer automatically
        if player.get("user_id") and str(player["user_id"]) == str(group["owner_user_id"]):
            role = GroupRole.ORGANIZER

        # Add to group
        group_player = await self.group_players_repo.add_player_to_group(
            group_id=group_id,
            player_id=player_id,
            initial_rating=initial_rating,
            membership_type=membership_type.value,
            skill_level=skill_level.value if skill_level else None,
            role=role.value,
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

        # Prepare player data for bulk add with skill-based ratings
        # First build a map of player_id -> player_data for quick lookups
        players_map = {}
        player_ids = [p.player_id for p in data.players]
        for player_id in player_ids:
            player = await self.players_repo.get_by_id(player_id)
            if not player:
                raise NotFoundError("Player", str(player_id))
            if str(player["owner_user_id"]) != user_id:
                raise ForbiddenError(f"You don't own player {player_id}")
            players_map[player_id] = player

        # Get base rating from group settings
        base_rating = group["settings"].get("initialRating", 1000)

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
            
            # Check for organizer role
            role = GroupRole.PLAYER
            player_details = players_map.get(p.player_id)
            if player_details and player_details.get("user_id") and str(player_details["user_id"]) == str(group["owner_user_id"]):
                role = GroupRole.ORGANIZER
            
            players_data.append({
                "player_id": p.player_id, 
                "membership_type": p.membership_type.value,
                "initial_rating": initial_rating,
                "skill_level": p.skill_level.value if p.skill_level else None,
                "role": role.value,
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
        new_role = data.role.value if data.role else None
        
        await self.group_players_repo.update_group_player(
            group_player_id=group_player_id,
            membership_type=new_membership_type,
            skill_level=new_skill_level,
            role=new_role,
        )

        # Get full info
        full_gp = await self.group_players_repo.get_by_id(group_player_id)

        return self._to_group_player_response(full_gp)

    async def list_group_players(
        self, user_id: str, group_id: UUID
    ) -> List[GroupPlayerResponse]:
        """List all players in a group."""
        # Verify group ownership or membership
        group = await self.groups_repo.get_by_id(group_id)

        if not group:
            raise NotFoundError("Group", str(group_id))

        if str(group["owner_user_id"]) != user_id:
            # Check if user is a member
            is_member = await self.group_players_repo.is_member(user_id, group_id)
            if not is_member:
                raise ForbiddenError("You don't have access to this group")

        # Get players
        players = await self.group_players_repo.list_by_group(group_id)
        
        # Get rating_before from last completed event to calculate deltas
        rating_before_map = await self.rating_updates_repo.get_last_event_deltas(group_id)

        # Build responses with calculated deltas
        responses = []
        for p in players:
            # Calculate delta as current - before (if player was in last event)
            rating_before = rating_before_map.get(p["id"])
            rating_delta = None
            if rating_before is not None:
                rating_delta = float(p["rating"]) - rating_before
            responses.append(self._to_group_player_response(p, rating_delta))
        
        return responses

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

        # Try to remove - may fail if player has game history
        try:
            removed = await self.group_players_repo.remove_from_group(
                group_id, group_player_id
            )
        except asyncpg.ForeignKeyViolationError:
            raise ConflictError(
                "Cannot remove player - they have participated in games. "
                "You can change their membership type to 'Sub' instead."
            )

        if not removed:
            raise NotFoundError("GroupPlayer", str(group_player_id))

    def _to_group_player_response(self, gp: dict, rating_delta: float = None) -> GroupPlayerResponse:
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

        # Handle role
        role = gp.get("role", "PLAYER")
        if isinstance(role, str):
            role = GroupRole(role)

        return GroupPlayerResponse(
            id=gp["id"],
            playerId=gp["player_id"],
            groupId=gp["group_id"],
            displayName=gp["display_name"],
            membershipType=membership_type,
            skillLevel=skill_level,
            role=role,
            userId=gp.get("user_id"),
            rating=float(gp["rating"]),
            gamesPlayed=gp["games_played"],
            wins=gp["wins"],
            losses=gp["losses"],
            ties=gp["ties"],
            winRate=float(win_rate),
            ratingDelta=rating_delta,
        )

    def _to_player_response(self, player: dict) -> PlayerResponse:
        """Convert a player dict to a response."""
        return PlayerResponse(
            id=player["id"],
            displayName=player["display_name"],
            notes=player["notes"],
            userId=player.get("user_id"),
            inviteToken=player.get("invite_token"),
            created_at=player["created_at"],
        )

    async def generate_invite(self, user_id: str, player_id: UUID) -> str:
        """Generate an invite token for a player."""
        # Verify ownership
        await self.get_player(user_id, player_id)
        
        import secrets
        token = secrets.token_urlsafe(16)
        
        # Save to player
        await self.players_repo.update(player_id, invite_token=token)
        
        return token

    async def link_player(self, user_id: str, invite_token: str) -> PlayerResponse:
        """Link current user to a player via invite token."""
        # Find player by token
        player = await self.players_repo.get_by_invite_token(invite_token)
        if not player:
            raise NotFoundError("Invite token", invite_token)
            
        # Check if already linked
        if player["user_id"]:
             if str(player["user_id"]) == user_id:
                 # Already linked to this user, harmless
                 return self._to_player_response(player)
             else:
                 raise ConflictError("Player already linked to a user")
             
        updated = await self.players_repo.update(player["id"], user_id=user_id, invite_token=None)
        
        return self._to_player_response(updated)







