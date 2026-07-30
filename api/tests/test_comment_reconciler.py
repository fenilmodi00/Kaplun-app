# api/tests/test_comment_reconciler.py
"""Tests for api/comment_reconciler.py — in-memory fake store + monkeypatched
async graph_client stubs (no network, no Appwrite).

Covers: reconcile_once (keyword match, dedup, self-skip, since_ms) and
attach_next_reels (new media appended to bound_media_ids)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from api import comment_reconciler, graph_client
from api.comment_reconciler import LOOKBACK_HOURS, attach_next_reels, reconcile_once
from api.main import app


# ── FakeStore ──────────────────────────────────────────────────────────────────


class FakeStore:
    """In-memory AutomationStore fake for reconciler tests."""

    def __init__(self):
        self.automations: list[dict] = []
        self.creators: dict[str, dict] = {}
        self.logs: dict[str, dict] = {}
        self.jobs: list[dict] = []
        self._seq = 0

    # automations
    def list_all_active_automations(self) -> list[dict]:
        return [a for a in self.automations if a.get("status") == "active"]

    def update_automation(self, automation_id: str, data: dict) -> dict:
        for a in self.automations:
            if a["$id"] == automation_id:
                a.update(data)
                return a
        raise KeyError(automation_id)

    # creators
    def get_creator_by_clerk_id(self, clerk_id: str) -> dict | None:
        return self.creators.get(clerk_id)

    # logs
    def find_log(self, automation_id: str, comment_id: str) -> dict | None:
        for log in self.logs.values():
            if log["automation_id"] == automation_id and log["comment_id"] == comment_id:
                return log
        return None

    # jobs
    def create_job(self, type_: str, payload: dict, run_at_iso: str | None = None) -> dict:
        self._seq += 1
        job = {"$id": f"j{self._seq}", "type": type_, "payload": payload}
        self.jobs.append(job)
        return job


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def store():
    return FakeStore()


@pytest.fixture
def client():
    return TestClient(app)


def _make_auto(**overrides) -> dict:
    auto = {
        "$id": "a1",
        "clerk_user_id": "user1",
        "ig_user_id": "ig1",
        "target_type": "all_posts",
        "keywords": ["link"],
        "match_mode": "whole_word",
        "status": "active",
        "media_ids": [],
        "bound_media_ids": [],
    }
    auto.update(overrides)
    return auto


CREATOR = {"$id": "cr1", "clerk_user_id": "user1", "access_token": "plain-token"}


# ── reconcile_once tests ───────────────────────────────────────────────────────


class TestReconcileOnce:
    """Tests for reconcile_once(store)."""

    async def test_match_creates_job(self, store, monkeypatch):
        """Comment matching a keyword with no existing log → process_comment job."""
        store.automations = [_make_auto()]
        store.creators["user1"] = CREATOR

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            return [{
                "id": "c1",
                "text": "send link please",
                "from": {"id": "u42", "username": "alice"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)
        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 1}
        assert len(store.jobs) == 1
        job = store.jobs[0]
        assert job["type"] == "process_comment"
        payload = job["payload"]
        assert payload["comment_id"] == "c1"
        assert payload["comment_text"] == "send link please"
        assert payload["commenter_id"] == "u42"
        assert payload["commenter_name"] == "alice"
        assert payload["media_id"] == "m1"
        assert payload["instagram_account_id"] == "ig1"

    async def test_already_logged_skips(self, store, monkeypatch):
        """Comment already logged → no job created."""
        store.automations = [_make_auto()]
        store.creators["user1"] = CREATOR
        store.logs["log1"] = {
            "$id": "log1",
            "automation_id": "a1",
            "comment_id": "c1",
        }

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            return [{
                "id": "c1",
                "text": "send link please",
                "from": {"id": "u42", "username": "alice"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)
        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 0}
        assert store.jobs == []

    async def test_own_comment_skipped(self, store, monkeypatch):
        """Creator's own comment (from.id == ig_user_id) → no job."""
        store.automations = [_make_auto(ig_user_id="ig1")]
        store.creators["user1"] = CREATOR

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            return [{
                "id": "c1",
                "text": "send link please",
                "from": {"id": "ig1", "username": "creator"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)
        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 0}
        assert store.jobs == []

    async def test_since_ms_is_approximately_72h(self, store, monkeypatch):
        """get_recent_media_comments is called with a since_ms ~72h in the past."""
        store.automations = [_make_auto()]
        store.creators["user1"] = CREATOR
        captured_args = []

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            captured_args.append((media_id, since_ms))
            return []

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)
        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        await reconcile_once(store)
        assert len(captured_args) == 1
        _, since_ms = captured_args[0]
        # since_ms should be ~72h ago (allow 5s clock skew)
        expected = (datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).timestamp() * 1000
        assert abs(since_ms - expected) < 5000  # within 5 seconds

    async def test_no_creator_skips(self, store, monkeypatch):
        """Automation with no matching creator is skipped."""
        store.automations = [_make_auto()]
        # No creator in store

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 0}
        assert store.jobs == []

    async def test_no_access_token_skips(self, store, monkeypatch):
        """Creator without access_token is skipped."""
        store.automations = [_make_auto()]
        store.creators["user1"] = {"$id": "cr1", "clerk_user_id": "user1"}  # no access_token

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 0}
        assert store.jobs == []

    async def test_keyword_mismatch_skips(self, store, monkeypatch):
        """Comment that doesn't match keywords → no job."""
        store.automations = [_make_auto(keywords=["pricing"])]
        store.creators["user1"] = CREATOR

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            return [{
                "id": "c1",
                "text": "send link please",
                "from": {"id": "u42", "username": "alice"},
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }]

        async def fake_media(limit=25, *, access_token, **kw):
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)
        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        result = await reconcile_once(store)
        assert result == {"enqueued": 0}
        assert store.jobs == []

    async def test_specific_posts_uses_media_ids(self, store, monkeypatch):
        """Automation with target_type=specific_posts uses media_ids, not all_posts."""
        store.automations = [_make_auto(
            target_type="specific_posts",
            media_ids=["m1", "m2"],
        )]
        store.creators["user1"] = CREATOR
        comments_called_with = []

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            comments_called_with.append(media_id)
            return []

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)

        await reconcile_once(store)
        # Should have been called for m1 and m2 (not via get_user_media)
        assert comments_called_with == ["m1", "m2"]

    async def test_next_reel_uses_bound_media_ids(self, store, monkeypatch):
        """Automation with target_type=next_reel uses bound_media_ids."""
        store.automations = [_make_auto(
            target_type="next_reel",
            bound_media_ids=["m1"],
        )]
        store.creators["user1"] = CREATOR
        comments_called_with = []

        async def fake_comments(media_id, since_ms, *, access_token, **kw):
            comments_called_with.append(media_id)
            return []

        monkeypatch.setattr(graph_client, "get_recent_media_comments", fake_comments)

        await reconcile_once(store)
        assert comments_called_with == ["m1"]


# ── attach_next_reels tests ────────────────────────────────────────────────────


class TestAttachNextReels:
    """Tests for attach_next_reels(store)."""

    async def test_new_media_appended(self, store, monkeypatch):
        """Newest media not in bound_media_ids → appended."""
        store.automations = [_make_auto(
            target_type="next_reel",
            bound_media_ids=["old1"],
        )]
        store.creators["user1"] = CREATOR

        async def fake_media(limit=1, *, access_token, **kw):
            return [{"id": "new1"}]

        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        attached = await attach_next_reels(store)
        assert attached == 1
        auto = store.automations[0]
        assert auto["bound_media_ids"] == ["old1", "new1"]

    async def test_existing_media_skipped(self, store, monkeypatch):
        """Newest media already in bound_media_ids → no change."""
        store.automations = [_make_auto(
            target_type="next_reel",
            bound_media_ids=["existing1"],
        )]
        store.creators["user1"] = CREATOR

        async def fake_media(limit=1, *, access_token, **kw):
            return [{"id": "existing1"}]

        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        attached = await attach_next_reels(store)
        assert attached == 0
        auto = store.automations[0]
        assert auto["bound_media_ids"] == ["existing1"]

    async def test_skips_non_next_reel_automations(self, store, monkeypatch):
        """Automations with target_type != next_reel are skipped."""
        store.automations = [
            _make_auto(target_type="all_posts", bound_media_ids=[]),
            _make_auto(target_type="specific_posts", bound_media_ids=[]),
        ]
        store.creators["user1"] = CREATOR
        media_called = False

        async def fake_media(limit=1, *, access_token, **kw):
            nonlocal media_called
            media_called = True
            return [{"id": "m1"}]

        monkeypatch.setattr(graph_client, "get_user_media", fake_media)

        attached = await attach_next_reels(store)
        assert attached == 0
        assert not media_called

    async def test_no_creator_skips(self, store, monkeypatch):
        """Automation with no matching creator is skipped."""
        store.automations = [_make_auto(target_type="next_reel")]
        # No creator in store

        attached = await attach_next_reels(store)
        assert attached == 0

    async def test_no_access_token_skips(self, store, monkeypatch):
        """Creator without access_token is skipped."""
        store.automations = [_make_auto(target_type="next_reel")]
        store.creators["user1"] = {"$id": "cr1", "clerk_user_id": "user1"}  # no access_token

        attached = await attach_next_reels(store)
        assert attached == 0


# ── Cron endpoint auth tests ───────────────────────────────────────────────────


class TestReconcileEndpoint:
    """POST /cron/reconcile auth gating."""

    def test_missing_secret_401(self, client):
        r = client.post("/cron/reconcile")
        assert r.status_code == 401

    def test_wrong_secret_401(self, client):
        r = client.post("/cron/reconcile", headers={"X-Cron-Secret": "wrong-secret"})
        assert r.status_code == 401

    def test_correct_secret_200(self, client, store, monkeypatch):
        """Happy path: correct secret returns 200 with enqueued/attached counts."""
        import api.routes.cron as cron_mod
        monkeypatch.setattr(cron_mod, "get_automation_store", lambda: store)

        async def fake_reconcile(s):
            return {"enqueued": 3}

        async def fake_attach(s):
            return 2

        # Patch on cron_mod because it imported the functions at module level
        # (from api.comment_reconciler import ...).
        monkeypatch.setattr(cron_mod, "reconcile_once", fake_reconcile)
        monkeypatch.setattr(cron_mod, "attach_next_reels", fake_attach)

        r = client.post("/cron/reconcile", headers={"X-Cron-Secret": "test-cron-secret"})
        assert r.status_code == 200
        assert r.json() == {"enqueued": 3, "attached": 2}
