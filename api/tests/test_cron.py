# api/tests/test_cron.py
"""Tests for the token-refresh cron endpoint.

Uses a FakeStore monkeypatched into the cron route module and a fake
refresh_long_lived_token so no network calls are made."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.token_crypto import get_token_crypto


# ── FakeStore ──────────────────────────────────────────────────────────────────


class FakeStore:
    """In-memory AutomationStore fake for cron tests."""

    def __init__(self):
        self.creators: dict[str, dict] = {}
        self.logs: dict[str, dict] = {}
        self.webhook_events: dict[str, dict] = {}
        self.calls: list[tuple[str, tuple, dict]] = []

    def _record(self, method: str, *args, **kwargs):
        self.calls.append((method, args, kwargs))

    def list_creators_with_token_expiring_before(self, iso: str) -> list[dict]:
        self._record("list_creators_with_token_expiring_before", iso)
        return [
            c for c in self.creators.values()
            if c.get("token_expires_at", "") <= iso
        ]

    def update_creator_token(self, creator_id: str, encrypted_token: str, expires_at_iso: str) -> dict:
        self._record("update_creator_token", creator_id, encrypted_token, expires_at_iso)
        if creator_id in self.creators:
            self.creators[creator_id]["access_token"] = encrypted_token
            self.creators[creator_id]["token_expires_at"] = expires_at_iso
        return self.creators.get(creator_id, {})

    def delete_logs_older_than(self, cutoff_iso: str) -> int:
        self._record("delete_logs_older_than", cutoff_iso)
        to_delete = [rid for rid, row in self.logs.items()
                     if row.get("created_at", "") < cutoff_iso]
        for rid in to_delete:
            del self.logs[rid]
        return len(to_delete)

    def delete_webhook_events_older_than(self, cutoff_iso: str) -> int:
        self._record("delete_webhook_events_older_than", cutoff_iso)
        to_delete = [rid for rid, row in self.webhook_events.items()
                     if row.get("received_at", "") < cutoff_iso]
        for rid in to_delete:
            del self.webhook_events[rid]
        return len(to_delete)


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def store():
    return FakeStore()


@pytest.fixture(autouse=True)
def _patch_store(monkeypatch, store):
    import api.routes.cron as cron_mod
    monkeypatch.setattr(cron_mod, "get_automation_store", lambda: store)


@pytest.fixture
def client():
    return TestClient(app)


def _near_expiry(days_ahead: int = 5) -> str:
    """Return an ISO timestamp `days_ahead` from now."""
    return (datetime.now(timezone.utc) + timedelta(days=days_ahead)).isoformat()


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestAuth:
    def test_missing_secret_401(self, client):
        r = client.post("/cron/refresh-tokens")
        assert r.status_code == 401

    def test_wrong_secret_401(self, client):
        r = client.post("/cron/refresh-tokens", headers={"X-Cron-Secret": "wrong-secret"})
        assert r.status_code == 401

    def test_correct_secret_200(self, client, store):
        """Happy path: correct secret returns 200 even with no creators."""
        r = client.post("/cron/refresh-tokens", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        assert r.json() == {"refreshed": 0, "failed": 0}


class TestRefreshSuccess:
    def test_refresh_expiring_token(self, client, store):
        """Creator with token expiring in 5 days gets refreshed."""
        crypto = get_token_crypto()
        original_token = "ig_long_lived_token_abc123"
        encrypted_original = crypto.encrypt(original_token)
        creator_id = "creator_1"
        store.creators[creator_id] = {
            "$id": creator_id,
            "access_token": encrypted_original,
            "token_expires_at": _near_expiry(5),
        }

        # Fake a successful token refresh
        import api.routes.cron as cron_mod
        new_token = "refreshed_token_xyz789"
        new_expires_in = 5_184_000  # 60 days in seconds

        async def fake_refresh(token, **kwargs):
            assert token == original_token
            return {"access_token": new_token, "expires_in": new_expires_in}

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(cron_mod, "refresh_long_lived_token", fake_refresh)
        try:
            r = client.post("/cron/refresh-tokens", headers={"X-Cron-Secret": "test-cron-secret"})
        finally:
            monkeypatch.undo()

        assert r.status_code == 200
        body = r.json()
        assert body["refreshed"] == 1
        assert body["failed"] == 0

        # Verify the store was called to update the token
        updated = store.creators[creator_id]
        # The new token should be encrypted (starts with "enc1:")
        assert updated["access_token"].startswith("enc1:")
        # Decrypt and verify
        decrypted = crypto.decrypt(updated["access_token"])
        assert decrypted == new_token
        # Expiry should be ~60 days from now
        new_expiry = datetime.fromisoformat(updated["token_expires_at"])
        assert abs((new_expiry - datetime.now(timezone.utc)).total_seconds() - new_expires_in) < 5

    def test_skip_creator_without_access_token(self, client, store):
        """Creator without access_token (instagrapi-only) is skipped."""
        creator_id = "creator_2"
        store.creators[creator_id] = {
            "$id": creator_id,
            "ig_session_json": '{"some": "session"}',
            "token_expires_at": _near_expiry(5),
            # no access_token
        }

        r = client.post("/cron/refresh-tokens", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        body = r.json()
        assert body["refreshed"] == 0
        assert body["failed"] == 0
        # Verify no update_creator_token call was made
        update_calls = [c for c in store.calls if c[0] == "update_creator_token"]
        assert len(update_calls) == 0


class TestRefreshFailure:
    def test_failed_refresh_counts_error(self, client, store):
        """When refresh_long_lived_token raises, the error is counted and row untouched."""
        crypto = get_token_crypto()
        original_token = "ig_token_will_fail"
        encrypted_original = crypto.encrypt(original_token)
        creator_id = "creator_3"
        store.creators[creator_id] = {
            "$id": creator_id,
            "access_token": encrypted_original,
            "token_expires_at": _near_expiry(5),
        }

        import api.routes.cron as cron_mod

        async def fake_refresh_fail(token, **kwargs):
            raise RuntimeError("Meta API timeout")

        monkeypatch = pytest.MonkeyPatch()
        monkeypatch.setattr(cron_mod, "refresh_long_lived_token", fake_refresh_fail)
        try:
            r = client.post("/cron/refresh-tokens", headers={"X-Cron-Secret": "test-cron-secret"})
        finally:
            monkeypatch.undo()

        assert r.status_code == 200
        body = r.json()
        assert body["refreshed"] == 0
        assert body["failed"] == 1

        # Row should be untouched (still has original encrypted token)
        updated = store.creators[creator_id]
        assert updated["access_token"] == encrypted_original
        # No update_creator_token call should have been made
        update_calls = [c for c in store.calls if c[0] == "update_creator_token"]
        assert len(update_calls) == 0


# ── Retention tests ────────────────────────────────────────────────────────────


class TestRetainLogs:
    def test_missing_secret_401(self, client):
        r = client.post("/cron/retain-logs")
        assert r.status_code == 401

    def test_wrong_secret_401(self, client):
        r = client.post("/cron/retain-logs", headers={"X-Cron-Secret": "wrong-secret"})
        assert r.status_code == 401

    def test_correct_secret_200(self, client, store):
        """Happy path: correct secret returns 200 even with empty store."""
        r = client.post("/cron/retain-logs", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        assert r.json() == {"deleted_logs": 0, "deleted_webhook_events": 0}

    def test_deletes_old_logs_keeps_new(self, client, store):
        """Old rows (created_at < 14 days ago) are deleted; new rows are kept."""
        now = datetime.now(timezone.utc)
        old_iso = (now - timedelta(days=20)).isoformat()
        new_iso = (now - timedelta(days=1)).isoformat()

        store.logs = {
            "old_log_1": {"$id": "old_log_1", "created_at": old_iso},
            "new_log_1": {"$id": "new_log_1", "created_at": new_iso},
        }
        store.webhook_events = {
            "old_evt_1": {"$id": "old_evt_1", "received_at": old_iso},
            "new_evt_1": {"$id": "new_evt_1", "received_at": new_iso},
        }

        r = client.post("/cron/retain-logs", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        body = r.json()
        assert body["deleted_logs"] == 1
        assert body["deleted_webhook_events"] == 1

        # Old rows removed, new rows remain
        assert "old_log_1" not in store.logs
        assert "new_log_1" in store.logs
        assert "old_evt_1" not in store.webhook_events
        assert "new_evt_1" in store.webhook_events

    def test_empty_store_zero_error(self, client, store):
        """Empty store returns zero counts without error."""
        store.logs = {}
        store.webhook_events = {}
        r = client.post("/cron/retain-logs", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        assert r.json() == {"deleted_logs": 0, "deleted_webhook_events": 0}
