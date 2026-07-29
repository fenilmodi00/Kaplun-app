"""Tests for AES-256-GCM token encryption at rest."""
from __future__ import annotations

import os

from api.token_crypto import TokenCrypto, decrypt_or_plaintext


def test_roundtrip():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    enc = c.encrypt("IGQVJ-example-token")
    assert enc != "IGQVJ-example-token"
    assert c.decrypt(enc) == "IGQVJ-example-token"


def test_random_nonce_different_ciphertexts():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    assert c.encrypt("same") != c.encrypt("same")


def test_decrypt_or_plaintext_migration_fallback():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    assert decrypt_or_plaintext("legacy-plaintext-token", c) == "legacy-plaintext-token"
    assert decrypt_or_plaintext(c.encrypt("new-token"), c) == "new-token"
