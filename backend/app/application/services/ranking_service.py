"""
Ranking service - handles ranking and history queries.
"""
from datetime import datetime
from typing import List, Optional
from uuid import UUID

from asyncpg import Connection

from app.api.schemas.rankings import MatchHistoryEntry, RankingEntry
from app.exceptions import ForbiddenError, NotFoundError
from app.infrastructure.repositories.groups_repo import GroupsRepository
from app.infrastructure.repositories.players_repo import GroupPlayersRepository


class RankingService:
    """Service for ranking and history operations."""

    def __init__(self, conn: Connection):
        self.conn = conn
        self.groups_repo = GroupsRepository(conn)
        self.group_players_repo = GroupPlayersRepository(conn)

    async def get_rankings(self, user_id: str, group_id: UUID) -> List[RankingEntry]:
        """Get rankings for a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Get all players sorted by rating
        players = await self.group_players_repo.list_by_group(group_id)

        rankings = []
        for idx, p in enumerate(players, 1):
            win_rate = p.get("win_rate", 0)
            if win_rate is None and p["games_played"] > 0:
                win_rate = (p["wins"] + 0.5 * p["ties"]) / p["games_played"]
            elif win_rate is None:
                win_rate = 0

            rankings.append(
                RankingEntry(
                    rank=idx,
                    playerId=p["player_id"],
                    displayName=p["display_name"],
                    rating=float(p["rating"]),
                    gamesPlayed=p["games_played"],
                    wins=p["wins"],
                    losses=p["losses"],
                    ties=p["ties"],
                    winRate=float(win_rate),
                )
            )

        return rankings

    async def get_match_history(
        self,
        user_id: str,
        group_id: UUID,
        from_date: Optional[datetime] = None,
        to_date: Optional[datetime] = None,
        player_id: Optional[UUID] = None,
    ) -> List[MatchHistoryEntry]:
        """Get match history for a group."""
        # Verify group ownership
        group = await self.groups_repo.get_by_id(group_id)
        if not group:
            raise NotFoundError("Group", str(group_id))
        if str(group["owner_user_id"]) != user_id:
            raise ForbiddenError("You don't own this group")

        # Build query - use stored team ELO from games table
        query = """
            SELECT 
                g.id as game_id,
                g.event_id,
                e.name as event_name,
                e.starts_at as event_date,
                g.round_index,
                g.court_index,
                g.score_team1,
                g.score_team2,
                g.result,
                g.team1_elo,
                g.team2_elo,
                p1.display_name as t1p1_name,
                p2.display_name as t1p2_name,
                p3.display_name as t2p1_name,
                p4.display_name as t2p2_name
            FROM games g
            JOIN events e ON e.id = g.event_id
            JOIN group_players gp1 ON gp1.id = g.team1_p1
            JOIN group_players gp2 ON gp2.id = g.team1_p2
            JOIN group_players gp3 ON gp3.id = g.team2_p1
            JOIN group_players gp4 ON gp4.id = g.team2_p2
            JOIN players p1 ON p1.id = gp1.player_id
            JOIN players p2 ON p2.id = gp2.player_id
            JOIN players p3 ON p3.id = gp3.player_id
            JOIN players p4 ON p4.id = gp4.player_id
            WHERE e.group_id = $1 AND e.status = 'COMPLETED'
        """

        params = [group_id]
        param_idx = 2

        if from_date:
            query += f" AND e.starts_at >= ${param_idx}"
            params.append(from_date)
            param_idx += 1

        if to_date:
            query += f" AND e.starts_at <= ${param_idx}"
            params.append(to_date)
            param_idx += 1

        if player_id:
            # Filter for games where this player participated
            # Need to get the group_player_id first
            gp_row = await self.conn.fetchrow(
                "SELECT id FROM group_players WHERE group_id = $1 AND player_id = $2",
                group_id,
                player_id,
            )
            if gp_row:
                gp_id = gp_row["id"]
                query += f" AND (g.team1_p1 = ${param_idx} OR g.team1_p2 = ${param_idx} OR g.team2_p1 = ${param_idx} OR g.team2_p2 = ${param_idx})"
                params.append(gp_id)
                param_idx += 1

        query += " ORDER BY e.starts_at DESC, g.round_index, g.court_index"

        rows = await self.conn.fetch(query, *params)

        matches = []
        for row in rows:
            # Use stored team ELO from games table
            team1_elo = float(row["team1_elo"]) if row["team1_elo"] else None
            team2_elo = float(row["team2_elo"]) if row["team2_elo"] else None
            
            matches.append(
                MatchHistoryEntry(
                    eventId=row["event_id"],
                    eventName=row["event_name"],
                    date=row["event_date"] or datetime.now(),
                    roundIndex=row["round_index"],
                    courtIndex=row["court_index"],
                    team1=[row["t1p1_name"], row["t1p2_name"]],
                    team2=[row["t2p1_name"], row["t2p2_name"]],
                    scoreTeam1=float(row["score_team1"]) if row["score_team1"] else None,
                    scoreTeam2=float(row["score_team2"]) if row["score_team2"] else None,
                    result=row["result"],
                    team1Elo=round(team1_elo, 0) if team1_elo else None,
                    team2Elo=round(team2_elo, 0) if team2_elo else None,
                )
            )

        return matches



