"""Print a locally signed Clerk-style JWT for the test stack.

Usage: python mint_token.py <user_id>   e.g. user_org, user_mem
The backend upserts users.clerk_user_id = sub on first request (app/api/deps/auth.py).
"""
import sys
import time

import jwt
from jwks_server import KID, load_private_key

ISSUER = "http://localhost:8765"
AUDIENCE = "picklerank-local"
TTL_SECONDS = 12 * 3600


def mint(user_id: str) -> str:
    now = int(time.time())
    claims = {"sub": user_id, "iss": ISSUER, "aud": AUDIENCE, "iat": now, "nbf": now, "exp": now + TTL_SECONDS}
    return jwt.encode(claims, load_private_key(), algorithm="RS256", headers={"kid": KID})


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: python mint_token.py <user_id>")
    print(mint(sys.argv[1]))
