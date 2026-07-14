"""
Symmetric encryption helpers for Spond credentials.

Spond has no official API and its access tokens expire, so to honour the
"log in once" UX we persist the organizer's Spond password and re-authenticate
on demand. The password is encrypted at rest with Fernet (AES-128-CBC + HMAC)
using a server-only key (SPOND_ENCRYPTION_KEY) and is never returned to clients.
"""

from cryptography.fernet import Fernet, InvalidToken

from app.config import get_settings
from app.exceptions import AppException


class SpondConfigError(AppException):
    """Raised when the Spond feature is not configured on the server."""

    def __init__(self, detail: str = "Spond integration is not configured on this server."):
        super().__init__(status_code=503, detail=detail)


def _get_fernet() -> Fernet:
    key = get_settings().spond_encryption_key
    if not key:
        raise SpondConfigError(
            "SPOND_ENCRYPTION_KEY is not set. Generate one with "
            "\"python -c 'from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())'\"."
        )
    try:
        return Fernet(key.encode() if isinstance(key, str) else key)
    except (ValueError, TypeError) as exc:
        raise SpondConfigError(
            "SPOND_ENCRYPTION_KEY is invalid; expected a urlsafe base64 Fernet key."
        ) from exc


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a secret string, returning urlsafe base64 ciphertext."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a secret previously produced by :func:`encrypt_secret`."""
    try:
        return _get_fernet().decrypt(ciphertext.encode()).decode()
    except InvalidToken as exc:
        raise SpondConfigError(
            "Stored Spond credentials could not be decrypted. The SPOND_ENCRYPTION_KEY may have changed; "
            "the organizer must reconnect their Spond account."
        ) from exc
