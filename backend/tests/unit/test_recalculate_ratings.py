"""recalculate_ratings must keep producing exactly the same ratings, team ELOs and audit rows.

GOLDEN was captured by running the pre-refactor (one query per event/game/player)
implementation against this same fake connection, so any drift in the rating math
or in which rows get written shows up as a diff here.
"""
from contextlib import asynccontextmanager
from datetime import datetime
from uuid import UUID

import pytest

from app.application.services.group_service import GroupService


def U(n: int) -> UUID:
    return UUID(int=n)


OWNER = "owner-user"
GROUP = U(999)
SKILLS = {U(1): "ADVANCED", U(2): None, U(3): "BEGINNER", U(4): "INTERMEDIATE",
          U(5): None, U(6): "ADVANCED", U(7): None, U(8): "BEGINNER"}
NAMES = {pid: f"P{pid.int}" for pid in SKILLS}
EVENTS = [  # (id, starts_at, created_at); deliberately out of chronological order
    (U(102), datetime(2026, 1, 8), datetime(2026, 1, 1)),
    (U(101), datetime(2026, 1, 1), datetime(2026, 1, 1)),
    (U(103), datetime(2026, 1, 15), datetime(2026, 1, 1)),  # completed but no games
]
GAMES = [  # (id, event, round, court, t1p1, t1p2, t2p1, t2p2, s1, s2, result)
    (U(201), U(101), 0, 0, U(1), U(2), U(3), U(4), 11, 7, "TEAM1_WIN"),
    (U(202), U(101), 0, 1, U(5), U(6), U(7), U(8), 9, 11, "TEAM2_WIN"),
    (U(203), U(101), 1, 0, U(1), U(3), U(2), U(4), 10, 10, "TIE"),
    (U(204), U(101), 1, 1, U(5), U(7), U(6), U(8), None, None, "UNSET"),
    (U(205), U(102), 0, 0, U(1), U(5), U(2), U(6), 11, 3, "TEAM1_WIN"),
    (U(206), U(102), 0, 1, U(3), U(7), U(4), U(8), 6, 11, "TEAM2_WIN"),
    (U(207), U(102), 1, 0, U(1), U(8), U(4), U(5), 11, 9, "TEAM1_WIN"),
    (U(208), U(102), 1, 1, U(2), U(7), U(3), U(6), 4, 11, "TEAM2_WIN"),
]


def _game_row(g):
    gid, eid, r, c, a, b, x, y, s1, s2, res = g
    return {"id": gid, "event_id": eid, "round_index": r, "court_index": c,
            "team1_p1": a, "team1_p2": b, "team2_p1": x, "team2_p2": y,
            "score_team1": s1, "score_team2": s2, "result": res,
            "t1p1_name": NAMES[a], "t1p2_name": NAMES[b], "t2p1_name": NAMES[x], "t2p2_name": NAMES[y]}


class RecordingConn:
    """In-memory stand-in for the queries recalculate_ratings issues, old and new shapes."""

    def __init__(self):
        self.team_elos = {}
        self.players = {}
        self.rating_updates = []
        self.in_transaction = False

    @asynccontextmanager
    async def _tx(self):
        self.in_transaction = True
        try:
            yield
        finally:
            self.in_transaction = False

    def transaction(self):
        return self._tx()

    def _ordered_events(self):
        return sorted(EVENTS, key=lambda e: (e[1], e[2]))

    async def fetch(self, query, *args):
        if "SELECT id, skill_level FROM group_players" in query:
            return [{"id": pid, "skill_level": s} for pid, s in SKILLS.items()]
        if "FROM games g" in query and "COMPLETED" in query:  # all games of completed events
            order = {e[0]: i for i, e in enumerate(self._ordered_events())}
            rows = sorted(GAMES, key=lambda g: (order[g[1]], g[2], g[3]))
            return [_game_row(g) for g in rows]
        if "FROM events" in query and "COMPLETED" in query:
            return [{"id": e[0], "name": "E", "starts_at": e[1]} for e in self._ordered_events()]
        if "WHERE g.event_id = $1" in query:
            return [_game_row(g) for g in sorted(GAMES, key=lambda g: (g[2], g[3])) if g[1] == args[0]]
        if "ORDER BY gp.rating DESC" in query:
            rows = [{"id": pid, "display_name": NAMES.get(pid, "?"), "rating": v[0],
                     "wins": v[2], "losses": v[3], "ties": v[4]} for pid, v in self.players.items()]
            return sorted(rows, key=lambda r: -r["rating"])
        raise AssertionError(f"unexpected fetch: {query}")

    async def execute(self, query, *args):
        assert self.in_transaction, "recalculation writes must be atomic"
        if "UPDATE games SET team1_elo" in query:
            self.team_elos[args[2]] = (args[0], args[1])
        elif "SET wins = 0" in query or "DELETE FROM rating_updates" in query or "pg_advisory_xact_lock" in query:
            pass
        elif "UPDATE group_players" in query and "SET rating" in query:
            self.players[args[5]] = tuple(args[:5])
        else:
            raise AssertionError(f"unexpected execute: {query}")
        return "OK"

    async def executemany(self, query, rows):
        assert self.in_transaction, "recalculation writes must be atomic"
        rows = list(rows)
        if "INSERT INTO rating_updates" in query:
            self.rating_updates.extend(tuple(r) for r in rows)
        elif "UPDATE games" in query:
            for r in rows:
                await self.execute("UPDATE games SET team1_elo", *r)
        elif "UPDATE group_players" in query:
            for r in rows:
                await self.execute("UPDATE group_players SET rating", *r)
        else:
            raise AssertionError(f"unexpected executemany: {query}")


async def _run(system: str):
    conn = RecordingConn()
    service = GroupService(conn)

    async def get_by_id(group_id):
        return {"id": group_id, "owner_user_id": OWNER,
                "settings": {"ratingSystem": system, "kFactor": 32, "initialRating": 1000}}

    service.groups_repo.get_by_id = get_by_id
    summary = await service.recalculate_ratings(OWNER, GROUP)
    return conn, summary


def _snapshot(conn):
    return {
        "team_elos": {k.int: v for k, v in sorted(conn.team_elos.items())},
        "players": {k.int: v for k, v in sorted(conn.players.items())},
        "rating_updates": sorted((r[0].int, r[1].int, *r[2:]) for r in conn.rating_updates),
    }


# fmt: off
GOLDEN = {'CATCH_UP': {'players': {1: (1139.187037394321, 4, 3, 0, 1),
                          2: (977.9376325938813, 4, 1, 2, 1),
                          3: (892.2719575994233, 4, 1, 2, 1),
                          4: (990.0709547713222, 4, 1, 2, 1),
                          5: (981.3350818527675, 3, 1, 2, 0),
                          6: (1079.0413602109832, 3, 1, 2, 0),
                          7: (986.8734611772184, 3, 1, 2, 0),
                          8: (955.1022439424305, 3, 3, 0, 0)},
              'rating_updates': [(101, 1, 1100, 1110.8416992699892, 10.841699269989249, 'CATCH_UP'),
                                 (101, 2, 1000, 1011.5019341050365, 11.501934105036526, 'CATCH_UP'),
                                 (101, 3, 900, 888.4997671218517, -11.500232878148267, 'CATCH_UP'),
                                 (101, 4, 1000, 988.4661674043934, -11.533832595606555, 'CATCH_UP'),
                                 (101, 5, 1000, 979.5179200063077, -20.48207999369231, 'CATCH_UP'),
                                 (101, 6, 1100, 1078.69863680656, -21.30136319344001, 'CATCH_UP'),
                                 (101, 7, 1000, 1020.4820799936923, 20.48207999369231, 'CATCH_UP'),
                                 (101, 8, 900, 922.5302879930615, 22.530287993061506, 'CATCH_UP'),
                                 (102,
                                  1,
                                  1110.8416992699892,
                                  1139.187037394321,
                                  28.345338124331647,
                                  'CATCH_UP'),
                                 (102,
                                  2,
                                  1011.5019341050365,
                                  977.9376325938813,
                                  -33.564301511155236,
                                  'CATCH_UP'),
                                 (102,
                                  3,
                                  888.4997671218517,
                                  892.2719575994233,
                                  3.7721904775715984,
                                  'CATCH_UP'),
                                 (102,
                                  4,
                                  988.4661674043934,
                                  990.0709547713222,
                                  1.6047873669288037,
                                  'CATCH_UP'),
                                 (102,
                                  5,
                                  979.5179200063077,
                                  981.3350818527675,
                                  1.8171618464598396,
                                  'CATCH_UP'),
                                 (102,
                                  6,
                                  1078.69863680656,
                                  1079.0413602109832,
                                  0.3427234044231682,
                                  'CATCH_UP'),
                                 (102,
                                  7,
                                  1020.4820799936923,
                                  986.8734611772184,
                                  -33.60861881647395,
                                  'CATCH_UP'),
                                 (102, 8, 922.5302879930615, 955.1022439424305, 32.571955949369, 'CATCH_UP')],
              'team_elos': {201: (1050.0, 950.0),
                            202: (1050.0, 950.0),
                            203: (999.6544623998107, 1000.0),
                            205: (1045.1798096381485, 1045.1002854557983),
                            206: (954.490923557772, 955.4982276987275),
                            207: (1032.746808643298, 1000.2225901911568),
                            208: (999.914778188629, 967.3723940083202)}},
 'RACS_ELO': {'players': {1: (1148.4141700262946, 4, 3, 0, 1),
                          2: (942.7791313236893, 4, 1, 2, 1),
                          3: (923.0171998996302, 4, 1, 2, 1),
                          4: (997.0947746875053, 4, 1, 2, 1),
                          5: (1027.8521539851013, 3, 1, 2, 0),
                          6: (1067.6390253844413, 3, 1, 2, 0),
                          7: (942.7211824614176, 3, 1, 2, 0),
                          8: (957.4253765605368, 3, 3, 0, 0)},
              'rating_updates': [(101, 1, 1100, 1110.394913500705, 10.394913500704888, 'RACS_ELO'),
                                 (101, 2, 1000, 1016.2087737543351, 16.208773754335084, 'RACS_ELO'),
                                 (101, 3, 900, 891.2926376802859, -8.707362319714093, 'RACS_ELO'),
                                 (101, 4, 1000, 983.7912262456649, -16.208773754335084, 'RACS_ELO'),
                                 (101, 5, 1000, 988.1043868771676, -11.895613122832401, 'RACS_ELO'),
                                 (101, 6, 1100, 1085.1974567503526, -14.802543249647442, 'RACS_ELO'),
                                 (101, 7, 1000, 1011.8956131228324, 11.895613122832401, 'RACS_ELO'),
                                 (101, 8, 900, 915.646318840143, 15.646318840142953, 'RACS_ELO'),
                                 (102,
                                  1,
                                  1110.394913500705,
                                  1148.4141700262946,
                                  38.01925652558975,
                                  'RACS_ELO'),
                                 (102,
                                  2,
                                  1016.2087737543351,
                                  942.7791313236893,
                                  -73.4296424306458,
                                  'RACS_ELO'),
                                 (102,
                                  3,
                                  891.2926376802859,
                                  923.0171998996302,
                                  31.724562219344307,
                                  'RACS_ELO'),
                                 (102,
                                  4,
                                  983.7912262456649,
                                  997.0947746875053,
                                  13.303548441840348,
                                  'RACS_ELO'),
                                 (102,
                                  5,
                                  988.1043868771676,
                                  1027.8521539851013,
                                  39.74776710793367,
                                  'RACS_ELO'),
                                 (102,
                                  6,
                                  1085.1974567503526,
                                  1067.6390253844413,
                                  -17.558431365911247,
                                  'RACS_ELO'),
                                 (102,
                                  7,
                                  1011.8956131228324,
                                  942.7211824614176,
                                  -69.17443066141482,
                                  'RACS_ELO'),
                                 (102,
                                  8,
                                  915.646318840143,
                                  957.4253765605368,
                                  41.779057720393894,
                                  'RACS_ELO')],
              'team_elos': {201: (1050.0, 950.0),
                            202: (1050.0, 950.0),
                            203: (1000.8437755904954, 1000.0),
                            205: (1049.2496501889364, 1050.7031152523439),
                            206: (951.5941254015592, 949.7187725429039),
                            207: (1043.3213247762649, 1021.6549299405954),
                            208: (981.1407071147254, 956.2960446575753)}},
 'SERIOUS_ELO': {'players': {1: (1142.048418477332, 4, 3, 0, 1),
                             2: (978.0484184773322, 4, 1, 2, 1),
                             3: (889.9515815226678, 4, 1, 2, 1),
                             4: (989.9515815226678, 4, 1, 2, 1),
                             5: (980.9874215352831, 3, 1, 2, 0),
                             6: (1080.9874215352831, 3, 1, 2, 0),
                             7: (987.0125784647169, 3, 1, 2, 0),
                             8: (951.0125784647169, 3, 3, 0, 0)},
                 'rating_updates': [(101, 1, 1100, 1111.5179200063076, 11.517920006307577, 'SERIOUS_ELO'),
                                    (101, 2, 1000, 1011.5179200063077, 11.51792000630769, 'SERIOUS_ELO'),
                                    (101, 3, 900, 888.4820799936923, -11.51792000630769, 'SERIOUS_ELO'),
                                    (101, 4, 1000, 988.4820799936923, -11.51792000630769, 'SERIOUS_ELO'),
                                    (101, 5, 1000, 979.5179200063077, -20.48207999369231, 'SERIOUS_ELO'),
                                    (101, 6, 1100, 1079.5179200063076, -20.482079993692423, 'SERIOUS_ELO'),
                                    (101, 7, 1000, 1020.4820799936923, 20.48207999369231, 'SERIOUS_ELO'),
                                    (101, 8, 900, 920.4820799936923, 20.48207999369231, 'SERIOUS_ELO'),
                                    (102,
                                     1,
                                     1111.5179200063076,
                                     1142.048418477332,
                                     30.53049847102443,
                                     'SERIOUS_ELO'),
                                    (102,
                                     2,
                                     1011.5179200063077,
                                     978.0484184773322,
                                     -33.46950152897546,
                                     'SERIOUS_ELO'),
                                    (102,
                                     3,
                                     888.4820799936923,
                                     889.9515815226678,
                                     1.4695015289754565,
                                     'SERIOUS_ELO'),
                                    (102,
                                     4,
                                     988.4820799936923,
                                     989.9515815226678,
                                     1.4695015289754565,
                                     'SERIOUS_ELO'),
                                    (102,
                                     5,
                                     979.5179200063077,
                                     980.9874215352831,
                                     1.4695015289754565,
                                     'SERIOUS_ELO'),
                                    (102,
                                     6,
                                     1079.5179200063076,
                                     1080.9874215352831,
                                     1.4695015289755702,
                                     'SERIOUS_ELO'),
                                    (102,
                                     7,
                                     1020.4820799936923,
                                     987.0125784647169,
                                     -33.46950152897546,
                                     'SERIOUS_ELO'),
                                    (102,
                                     8,
                                     920.4820799936923,
                                     951.0125784647169,
                                     30.530498471024544,
                                     'SERIOUS_ELO')],
                 'team_elos': {201: (1050.0, 950.0),
                               202: (1050.0, 950.0),
                               203: (1000.0, 1000.0),
                               205: (1045.5179200063076, 1045.5179200063076),
                               206: (954.4820799936923, 954.4820799936923),
                               207: (1032.0, 1000.0),
                               208: (1000.0, 968.0)}}}
# fmt: on


@pytest.mark.asyncio
@pytest.mark.parametrize("system", ["SERIOUS_ELO", "RACS_ELO", "CATCH_UP"])
async def test_recalculate_matches_pre_refactor_output(system):
    conn, summary = await _run(system)
    assert _snapshot(conn) == GOLDEN[system]
    assert summary["eventsRecalculated"] == 2  # the event without games is not counted
    assert summary["playersUpdated"] == 8


@pytest.mark.asyncio
async def test_recalculate_reraises_instead_of_skipping_event(monkeypatch):
    class Boom:
        def calculate_deltas(self, games, ratings):
            raise ValueError("bad game")

    monkeypatch.setattr("app.domain.ratings.factory.create_rating_system", lambda *a, **k: Boom())
    with pytest.raises(ValueError):
        await _run("SERIOUS_ELO")
