"""AES-256-GCM token encryption at rest — port of openreply's
lib/meta/oauth.ts encryptToken/decryptToken (MIT License,
Copyright (c) 2026 Anish Raj, Diwen Huang).

Format: "enc1:" || base64url(nonce[12] || ciphertext || tag).
Key: 32-byte base64url in TOKEN_ENCRYPTION_KEY. Generate:

    python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
"""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_PREFIX = "enc1:"


class TokenCrypto:
    """AES-256-GCM encrypt/decrypt with an "enc1:" prefix for migration safety."""

    def __init__(self, key_b64: str) -> None:
        self._aesgcm = AESGCM(base64.urlsafe_b64decode(key_b64.encode()))

    def encrypt(self, plaintext: str) -> str:
        """Return "enc1:" || base64url(nonce || ciphertext || tag)."""
        nonce = os.urandom(12)
        ct = self._aesgcm.encrypt(nonce, plaintext.encode(), None)
        return _PREFIX + base64.urlsafe_b64encode(nonce + ct).decode()

    def decrypt(self, stored: str) -> str:
        """Strip "enc1:" prefix, then base64url-decode and decrypt."""
        raw = base64.urlsafe_b64decode(stored.removeprefix(_PREFIX).encode())
        return self._aesgcm.decrypt(raw[:12], raw[12:], None).decode()


def get_token_crypto() -> TokenCrypto:
    """Build a TokenCrypto from the TOKEN_ENCRYPTION_KEY env var."""
    key = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY env var is not set")
    return TokenCrypto(key)


def decrypt_or_plaintext(stored: str, crypto: TokenCrypto) -> str:
    """Migration helper: legacy rows hold plaintext tokens.

    Attempts to decrypt; if decryption fails (legacy plaintext or
    corrupted value), returns the original string unchanged.
    """
    try:
        return crypto.decrypt(stored)
    except Exception:
        return stored
