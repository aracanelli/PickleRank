"""Seed the local test stack through the HTTP API only.

Creates league "Tuesday Ladder" owned by user_org with 12 regulars + 4 subs and
links player #2 to user_mem via invite/link. Prints ids as JSON on stdout.
Usage: python seed.py [--api http://localhost:8000/api]
"""
import json
import sys

import httpx
from mint_token import mint

API = sys.argv[sys.argv.index("--api") + 1] if "--api" in sys.argv else "http://localhost:8000/api"

REGULARS = [
    "Maya Okafor",
    "Daniel Reyes",  # player #2 -> linked to user_mem
    "Priya Raman",
    "Tom Kowalski",
    "Grace Liu",
    "Marcus Bell",
    "Elena Petrova",
    "Sam Whitaker",
    "Aisha Mensah",
    "Jordan Blake",
    "Hannah Schultz",
    "Maximilian Alexander Featherstonehaugh-Whitley",  # 46 chars: long-name layout case
]
SUBS = [("Chris Duarte", "ADVANCED"), ("Nina Alvarez", "INTERMEDIATE"), ("Owen Fischer", "BEGINNER"), ("Leah Kim", None)]


def client(user: str) -> httpx.Client:
    return httpx.Client(base_url=API, headers={"Authorization": f"Bearer {mint(user)}"}, timeout=30)


def ok(resp: httpx.Response) -> dict:
    if resp.status_code >= 400:
        sys.exit(f"{resp.request.method} {resp.request.url} -> {resp.status_code}: {resp.text}")
    return resp.json()


def seed() -> dict:
    org, mem = client("user_org"), client("user_mem")

    group = ok(org.post("/groups", json={"name": "Tuesday Ladder", "sport": "pickleball"}))
    gid = group["id"]

    names = REGULARS + [n for n, _ in SUBS]
    created = ok(org.post("/players/bulk", json={"names": names}))
    if created["skipped"] or created["errors"]:
        sys.exit(f"bulk create skipped/errored (DB not clean? run stop.ps1 + start.ps1): {created}")
    pid_by_name = {p["displayName"]: p["id"] for p in created["created"]}

    items = [{"playerId": pid_by_name[n], "membershipType": "PERMANENT"} for n in REGULARS]
    items += [{"playerId": pid_by_name[n], "membershipType": "SUB", "skillLevel": lvl} for n, lvl in SUBS]
    added = ok(org.post(f"/groups/{gid}/players/bulk", json={"players": items}))["added"]
    gp_by_name = {gp["displayName"]: gp["id"] for gp in added}

    linked_name = REGULARS[1]
    token = ok(org.post(f"/players/{pid_by_name[linked_name]}/invite"))
    linked = ok(mem.post("/players/link", params={"token": token}))
    assert linked["userId"], f"link did not set userId: {linked}"

    return {
        "groupId": gid,
        "groupName": group["name"],
        "linkedPlayer": {"user": "user_mem", "name": linked_name, "playerId": pid_by_name[linked_name], "groupPlayerId": gp_by_name[linked_name]},
        "regulars": [{"name": n, "groupPlayerId": gp_by_name[n]} for n in REGULARS],
        "subs": [{"name": n, "skillLevel": lvl, "groupPlayerId": gp_by_name[n]} for n, lvl in SUBS],
    }


if __name__ == "__main__":
    print(json.dumps(seed(), indent=2))
