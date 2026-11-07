"""Local JWKS server for the PickleRank test stack (stands in for Clerk).

Creates an RSA key in .keys/ on first run and serves its public JWK at
http://localhost:8765/jwks.json. Never use this key outside local testing.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jwt.algorithms import RSAAlgorithm

KEY_DIR = Path(__file__).parent / ".keys"
PRIVATE_KEY = KEY_DIR / "private.pem"
KID = "picklerank-local-1"
PORT = 8765


def load_private_key():
    if not PRIVATE_KEY.exists():
        KEY_DIR.mkdir(exist_ok=True)
        key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
        PRIVATE_KEY.write_bytes(
            key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            )
        )
    return serialization.load_pem_private_key(PRIVATE_KEY.read_bytes(), password=None)


def jwks_document() -> bytes:
    jwk = json.loads(RSAAlgorithm.to_jwk(load_private_key().public_key()))
    jwk.update(kid=KID, use="sig", alg="RS256")
    return json.dumps({"keys": [jwk]}).encode()


class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] not in ("/jwks.json", "/.well-known/jwks.json"):
            self.send_error(404)
            return
        body = jwks_document()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, fmt, *args):
        sys.stderr.write("[jwks] " + fmt % args + "\n")


if __name__ == "__main__":
    load_private_key()
    if "--init" in sys.argv:
        sys.exit(0)
    print(f"JWKS on http://localhost:{PORT}/jwks.json", flush=True)
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
