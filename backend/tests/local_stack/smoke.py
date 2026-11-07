"""End-to-end smoke test against the local stack, HTTP only.

Uses the newest "Tuesday Ladder" group owned by user_org (run seed.py first).
Prints PASS/FAIL per check; exit code 1 if any check fails.
Usage: python smoke.py [--api http://localhost:8000/api]
"""
import sys

from seed import API, client

results = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    results.append(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not cond else ""))
    return cond


def must(resp, name: str, status: int = 200) -> dict:
    if not check(f"{name} -> {status}", resp.status_code == status, f"got {resp.status_code}: {resp.text[:300]}"):
        sys.exit(f"aborting: {name} failed")
    return resp.json() if resp.content else {}


def main() -> None:
    org, mem = client("user_org"), client("user_mem")
    print(f"API {API}")

    groups = must(org.get("/groups"), "GET /groups (org)")["groups"]
    ladder = [g for g in groups if g["name"] == "Tuesday Ladder"]
    if not ladder:
        sys.exit("no 'Tuesday Ladder' group; run seed.py first")
    gid = sorted(ladder, key=lambda g: g["created_at"])[-1]["id"]

    players = must(org.get(f"/groups/{gid}/players"), "GET group players (org)")["players"]
    regulars = [p["id"] for p in players if p["membershipType"] == "PERMANENT"][:8]
    check("8 regulars available", len(regulars) == 8, f"found {len(regulars)}")
    before = {r["playerId"]: r["rating"] for r in must(org.get(f"/groups/{gid}/rankings"), "GET rankings before")["rankings"]}

    event = must(
        org.post(f"/groups/{gid}/events", json={"name": "Smoke Night", "courts": 2, "rounds": 2, "participantIds": regulars}),
        "POST create event", 201,
    )
    eid = event["id"]
    gen = must(org.post(f"/events/{eid}/generate", json={}), "POST generate")
    games = gen["games"]
    check("4 games generated (2 courts x 2 rounds)", len(games) == 4, f"got {len(games)}")

    # Includes a 0 and a tie.
    scores = [(11, 0), (7, 7), (11, 9), (5, 11)]
    expected = ["TEAM1_WIN", "TIE", "TEAM1_WIN", "TEAM2_WIN"]
    zero_game = games[0]["id"]
    for g, (s1, s2), exp in zip(games, scores, expected):
        r = must(org.patch(f"/games/{g['id']}/score", json={"scoreTeam1": s1, "scoreTeam2": s2}), f"PATCH score {s1}-{s2}")
        check(f"score {s1}-{s2} stored as {exp}", r["scoreTeam1"] == s1 and r["scoreTeam2"] == s2 and r["result"] == exp, str(r))

    first = None
    for i in range(2):  # resend the same score twice: must be idempotent
        r = must(org.patch(f"/games/{games[1]['id']}/score", json={"scoreTeam1": 7, "scoreTeam2": 7}), f"PATCH resend #{i + 1}")
        first = first or r
        check(f"resend #{i + 1} identical", r == first, f"{r} != {first}")

    ev = must(org.get(f"/events/{eid}"), "GET event (org)")
    check("event IN_PROGRESS before complete", ev["status"] == "IN_PROGRESS", ev["status"])
    check("event has 4 scored games", sum(1 for g in ev["games"] if g["result"] != "UNSET") == 4)

    done = must(org.post(f"/events/{eid}/complete"), "POST complete")
    check("complete -> COMPLETED", done["status"] == "COMPLETED", done["status"])
    check("8 rating updates", len(done["ratingUpdates"]) == 8, f"got {len(done['ratingUpdates'])}")

    after = {r["playerId"]: r for r in must(org.get(f"/groups/{gid}/rankings"), "GET rankings after (org)")["rankings"]}
    changed = [pid for pid, r in after.items() if r["rating"] != before.get(pid)]
    check("ratings changed for some participants", len(changed) > 0, "no rating changed")
    check("non-participants unchanged (8 regulars changed at most)", len(changed) <= 8, f"{len(changed)} changed")
    check("ties recorded in rankings", sum(r["ties"] for r in after.values()) == 4, f"ties={sum(r['ties'] for r in after.values())}")

    hist = must(org.get(f"/groups/{gid}/history", params={"eventId": eid}), "GET history (org)")["matches"]
    check("4 games in history", len(hist) == 4, f"got {len(hist)}")
    z = next((m for m in hist if m["gameId"] == zero_game), None)
    check("0 score preserved in history", z is not None and z["scoreTeam2"] == 0 and z["scoreTeam2"] is not None, str(z))
    check("tie preserved in history", any(m["result"] == "TIE" and m["scoreTeam1"] == 7 for m in hist))

    r = mem.get(f"/events/{eid}")
    check("member GET /events/{id} -> 403", r.status_code == 403, f"got {r.status_code}")
    must(mem.get(f"/groups/{gid}/rankings"), "member GET rankings")
    must(mem.get(f"/groups/{gid}/history"), "member GET history")

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
