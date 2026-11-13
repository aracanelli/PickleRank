"""Smoke test for offline-client safety against the local stack (real Postgres), HTTP only.

Checks the server guarantees the frontend outbox relies on when it replays queued writes:
- creates with a client-made id are idempotent (a replay returns the same row, no duplicate)
- score writes keep the newest edit by editedAt (a late, older replay does not overwrite)
- regenerating an event that has scores needs force
- rankings are not served to a user outside the league (cache checked after access)

Run seed.py first. Prints PASS/FAIL per check; exit code 1 if any check fails.
"""
import sys
import time
import uuid

from seed import client

results = []


def check(name: str, cond: bool, detail: str = "") -> bool:
    results.append(cond)
    print(f"{'PASS' if cond else 'FAIL'}  {name}" + (f"  ({detail})" if detail and not cond else ""))
    return cond


def main() -> None:
    org, stranger = client("user_org"), client(f"user_stranger_{uuid.uuid4().hex[:6]}")

    # --- idempotent group create
    gid = str(uuid.uuid4())
    r1 = org.post("/groups", json={"id": gid, "name": "Offline League"})
    r2 = org.post("/groups", json={"id": gid, "name": "Offline League"})
    check("group create with client id", r1.status_code in (200, 201) and r1.json()["id"] == gid, r1.text[:200])
    check("group create replay returns same group", r2.status_code in (200, 201) and r2.json()["id"] == gid, r2.text[:200])
    names = [g["name"] for g in org.get("/groups").json()["groups"]]
    check("no duplicate group after replay", names.count("Offline League") == 1, str(names.count("Offline League")))
    r3 = stranger.post("/groups", json={"id": gid, "name": "Hijack"})
    check("someone else's id -> 409", r3.status_code == 409, f"{r3.status_code} {r3.text[:200]}")

    # --- roster for an event: add 4 players to the new league with client ids
    gp_ids = []
    for i in range(4):
        pid = str(uuid.uuid4())
        rp = org.post("/players", json={"id": pid, "displayName": f"Offline P{i} {pid[:4]}"})
        rp2 = org.post("/players", json={"id": pid, "displayName": f"Offline P{i} {pid[:4]}"})
        check(f"player {i} create + replay", rp.status_code in (200, 201) and rp2.status_code in (200, 201) and rp2.json()["id"] == pid, f"{rp.status_code}/{rp2.status_code} {rp2.text[:160]}")
        gpid = str(uuid.uuid4())
        ra = org.post(f"/groups/{gid}/players", json={"id": gpid, "playerId": pid, "membershipType": "PERMANENT"})
        ra2 = org.post(f"/groups/{gid}/players", json={"id": gpid, "playerId": pid, "membershipType": "PERMANENT"})
        check(f"add player {i} + replay", ra.status_code in (200, 201) and ra2.status_code in (200, 201) and ra2.json()["id"] == ra.json()["id"], f"{ra.status_code}/{ra2.status_code} {ra2.text[:160]}")
        gp_ids.append(ra.json()["id"])

    # --- idempotent event create + generate
    eid = str(uuid.uuid4())
    body = {"id": eid, "name": "Offline night", "courts": 1, "rounds": 1, "participantIds": gp_ids}
    e1 = org.post(f"/groups/{gid}/events", json=body)
    e2 = org.post(f"/groups/{gid}/events", json=body)
    check("event create with client id", e1.status_code in (200, 201) and e1.json()["id"] == eid, e1.text[:200])
    check("event create replay returns same event", e2.status_code in (200, 201) and e2.json()["id"] == eid, e2.text[:200])
    events = org.get(f"/groups/{gid}/events").json()["events"]
    check("no duplicate event after replay", len([e for e in events if e["id"] == eid]) == 1 and len(events) == 1, str(len(events)))
    g = org.post(f"/events/{eid}/generate", json={"newSeed": False})
    check("generate -> 200", g.status_code == 200, g.text[:200])
    game = g.json()["games"][0]
    check("games carry editedAt", "editedAt" in game, str(list(game.keys())))

    # --- last write wins by edit time
    now = int(time.time() * 1000)
    newer = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 4, "editedAt": now})
    check("score write -> 200", newer.status_code == 200 and newer.json()["scoreTeam1"] == 11, newer.text[:200])
    stale = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 2, "scoreTeam2": 11, "editedAt": now - 60_000})
    check("older replay -> 200 with the newer stored score", stale.status_code == 200 and stale.json()["scoreTeam1"] == 11 and stale.json()["scoreTeam2"] == 4, stale.text[:200])
    stored = [x for x in org.get(f"/events/{eid}").json()["games"] if x["id"] == game["id"]][0]
    check("stored score unchanged by older replay", stored["scoreTeam1"] == 11 and stored["scoreTeam2"] == 4, str(stored))
    future = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 6, "editedAt": now + 3_600_000})
    after_future = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 7, "editedAt": now + 1000})
    check("future clock is clamped (later real edit still wins)", future.status_code == 200 and after_future.json()["scoreTeam2"] == 7, after_future.text[:200])
    # slow device clock: it saw the latest score (baseEditedAt), so its correction wins anyway
    seen = org.get(f"/events/{eid}").json()
    seen_game = [x for x in seen["games"] if x["id"] == game["id"]][0]
    slow = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 9, "editedAt": now - 600_000, "baseEditedAt": seen_game["editedAt"]})
    check("slow clock + current base -> correction wins", slow.status_code == 200 and slow.json()["scoreTeam2"] == 9, slow.text[:200])
    stale_base = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 1, "editedAt": now - 600_000, "baseEditedAt": seen_game["editedAt"]})
    check("same old base again (someone edited since) -> ignored", stale_base.status_code == 200 and stale_base.json()["scoreTeam2"] == 9, stale_base.text[:200])
    no_ts = org.patch(f"/games/{game['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 8})
    check("write without editedAt still works", no_ts.status_code == 200 and no_ts.json()["scoreTeam2"] == 8, no_ts.text[:200])

    # --- regenerate guard
    regen = org.post(f"/events/{eid}/generate", json={"newSeed": True})
    check("regenerate with scores and no force -> 409", regen.status_code == 409, f"{regen.status_code} {regen.text[:200]}")
    forced = org.post(f"/events/{eid}/generate", json={"newSeed": True, "force": True})
    check("regenerate with force -> 200", forced.status_code == 200, forced.text[:200])

    # --- rankings access before cache
    own = org.get(f"/groups/{gid}/rankings")
    check("owner reads rankings (fills cache)", own.status_code == 200, own.text[:200])
    leak = stranger.get(f"/groups/{gid}/rankings")
    check("stranger denied rankings even when cached", leak.status_code in (403, 404), f"{leak.status_code} {leak.text[:200]}")

    # --- complete twice (outbox replay)
    for x in org.get(f"/events/{eid}").json()["games"]:
        org.patch(f"/games/{x['id']}/score", json={"scoreTeam1": 11, "scoreTeam2": 5, "editedAt": int(time.time() * 1000)})
    c1 = org.post(f"/events/{eid}/complete")
    c2 = org.post(f"/events/{eid}/complete")
    check("complete -> 200", c1.status_code == 200, c1.text[:200])
    check("complete replay is harmless", c2.status_code in (200, 409), f"{c2.status_code} {c2.text[:200]}")

    # --- delete replay
    d1 = org.delete(f"/events/{str(uuid.uuid4())}")
    check("delete of a missing event -> 404 (outbox treats as done)", d1.status_code == 404, f"{d1.status_code}")

    failed = results.count(False)
    print(f"\n{len(results) - failed}/{len(results)} passed")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
