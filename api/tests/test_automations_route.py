# api/tests/test_automations_route.py
"""Tests for the automations CRUD + logs routes.

Uses dependency_overrides to bypass Clerk JWT auth and a FakeStore
monkeypatched into the route module so no network calls are made."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.routes.automations import require_clerk

# ── Auth override ──────────────────────────────────────────────────────────────


@pytest.fixture(autouse=True)
def _auth_override():
    """Set the Clerk auth override before each test; clear after."""
    app.dependency_overrides[require_clerk] = lambda: "clerk_test_1"
    yield
    app.dependency_overrides.clear()


# ── FakeStore ──────────────────────────────────────────────────────────────────


class FakeStore:
    """In-memory AutomationStore fake. Records calls and returns canned data."""

    def _record(self, method: str, *args, **kwargs):
        self.calls.append((method, args, kwargs))

    # ── automations ────────────────────────────────────────────────────────

    def list_automations(self, clerk_user_id: str) -> list[dict]:
        self._record("list_automations", clerk_user_id)
        return [a for a in self.automations.values()
                if a.get("clerk_user_id") == clerk_user_id]

    def get_automation(self, automation_id: str) -> dict | None:
        self._record("get_automation", automation_id)
        return self.automations.get(automation_id)

    def create_automation(self, data: dict) -> dict:
        self._record("create_automation", data)
        row_id = f"auto_{len(self.automations) + 1}"
        row = dict(data)
        row["$id"] = row_id
        self.automations[row_id] = row
        return row

    def update_automation(self, automation_id: str, data: dict) -> dict:
        self._record("update_automation", automation_id, data)
        if automation_id in self.automations:
            self.automations[automation_id].update(data)
        return self.automations.get(automation_id, {})

    def delete_automation(self, automation_id: str) -> None:
        self._record("delete_automation", automation_id)
        self.automations.pop(automation_id, None)

    # ── logs ───────────────────────────────────────────────────────────────

    def list_logs(self, automation_id: str, limit: int = 100) -> list[dict]:
        self._record("list_logs", automation_id, limit)
        return self.logs.get(automation_id, [])

    # ── stats ──────────────────────────────────────────────────────────────

    def count_logs_by_action(self, automation_id: str) -> dict[str, int]:
        self._record("count_logs_by_action", automation_id)
        logs = self.logs.get(automation_id, [])
        counts: dict[str, int] = {}
        for log in logs:
            action = log.get("action", "unknown")
            counts[action] = counts.get(action, 0) + 1
        return counts

    def count_logs_by_action_since(self, clerk_user_id: str, since_iso: str) -> dict[str, int]:
        self._record("count_logs_by_action_since", clerk_user_id, since_iso)
        # Aggregate across all logs for this user
        counts: dict[str, int] = {}
        for logs_list in self.logs.values():
            for log in logs_list:
                if log.get("clerk_user_id") == clerk_user_id and log.get("created_at", "") >= since_iso:
                    action = log.get("action", "unknown")
                    counts[action] = counts.get(action, 0) + 1
        return counts

    def top_keywords(self, clerk_user_id: str, since_iso: str, limit: int = 5) -> list[list]:
        self._record("top_keywords", clerk_user_id, since_iso, limit)
        kw_counts: dict[str, int] = {}
        for logs_list in self.logs.values():
            for log in logs_list:
                if log.get("clerk_user_id") == clerk_user_id and log.get("created_at", "") >= since_iso:
                    kw = log.get("matched_keyword")
                    if kw:
                        kw_counts[kw] = kw_counts.get(kw, 0) + 1
        sorted_kws = sorted(kw_counts.items(), key=lambda x: -x[1])
        return [[kw, count] for kw, count in sorted_kws[:limit]]

    # ── tracked links ──────────────────────────────────────────────────────

    def __init__(self):
        self.automations: dict[str, dict] = {}
        self.logs: dict[str, list[dict]] = {}
        self.creators: dict[str, dict] = {}
        self.tracked_links: dict[str, dict] = {}
        self.link_clicks: dict[str, list[dict]] = {}
        self.calls: list[tuple[str, tuple, dict]] = []

    def get_tracked_link_for_automation(self, automation_id: str) -> dict | None:
        self._record("get_tracked_link_for_automation", automation_id)
        for slug, link in self.tracked_links.items():
            if link.get("automation_id") == automation_id:
                return link
        return None

    def count_clicks(self, slug: str) -> int:
        self._record("count_clicks", slug)
        return len(self.link_clicks.get(slug, []))

    def count_clicks_since(self, slug: str, since_iso: str) -> int:
        self._record("count_clicks_since", slug, since_iso)
        return sum(1 for c in self.link_clicks.get(slug, [])
                   if c.get("clicked_at", "") >= since_iso)

    # ── creators ───────────────────────────────────────────────────────────

    def get_creator_by_clerk_id(self, clerk_user_id: str) -> dict | None:
        self._record("get_creator_by_clerk_id", clerk_user_id)
        return self.creators.get(clerk_user_id)


# ── Fixtures ───────────────────────────────────────────────────────────────────


@pytest.fixture
def store():
    return FakeStore()


@pytest.fixture(autouse=True)
def _patch_store(monkeypatch, store):
    import api.routes.automations as routes_mod
    monkeypatch.setattr(routes_mod, "get_automation_store", lambda: store)


@pytest.fixture
def client():
    return TestClient(app)


# ── Tests ──────────────────────────────────────────────────────────────────────


class TestCreateValidation:
    def test_empty_keywords_422(self, client):
        r = client.post("/automations", json={
            "name": "Test", "target_type": "all_posts",
            "keywords": [], "dm_message": "Hello"})
        assert r.status_code == 422

    def test_empty_dm_message_422(self, client):
        r = client.post("/automations", json={
            "name": "Test", "target_type": "all_posts",
            "keywords": ["keyword"], "dm_message": ""})
        assert r.status_code == 422

    def test_specific_posts_empty_media_ids_422(self, client):
        r = client.post("/automations", json={
            "name": "Test", "target_type": "specific_posts",
            "keywords": ["keyword"], "dm_message": "Hello",
            "media_ids": []})
        assert r.status_code == 422


class TestCreateSuccess:
    def test_valid_create_201(self, client, store):
        store.creators["clerk_test_1"] = {
            "clerk_user_id": "clerk_test_1",
            "ig_user_id": "ig_123",
            "access_token": "encrypted_token",
        }
        r = client.post("/automations", json={
            "name": "My Automation", "target_type": "all_posts",
            "keywords": ["keyword1", "keyword2"],
            "dm_message": "Thanks for your comment!",
            "match_mode": "whole_word",
        })
        assert r.status_code == 201
        body = r.json()
        auto = body["automation"]
        assert auto["clerk_user_id"] == "clerk_test_1"
        assert auto["status"] == "active"
        assert auto["ig_user_id"] == "ig_123"
        assert auto["opening_dm_mode"] == "direct"
        assert auto["track_links"] is False
        assert auto["bound_media_ids"] == []
        assert "created_at" in auto
        assert "updated_at" in auto
        assert auto["name"] == "My Automation"
        assert auto["keywords"] == ["keyword1", "keyword2"]

    def test_create_no_instagram_409(self, client, store):
        store.creators["clerk_test_1"] = {
            "clerk_user_id": "clerk_test_1",
            "ig_user_id": "ig_123",
            # no access_token
        }
        r = client.post("/automations", json={
            "name": "Test", "target_type": "all_posts",
            "keywords": ["kw"], "dm_message": "Hi"})
        assert r.status_code == 409
        assert r.json()["error"] == "instagram_not_connected"


class TestList:
    def test_list_returns_only_own_rows(self, client, store):
        store.automations = {
            "a1": {"$id": "a1", "clerk_user_id": "clerk_test_1", "name": "Mine"},
            "a2": {"$id": "a2", "clerk_user_id": "clerk_test_1", "name": "Also mine"},
            "a3": {"$id": "a3", "clerk_user_id": "other_user", "name": "Not mine"},
        }
        r = client.get("/automations")
        assert r.status_code == 200
        autos = r.json()["automations"]
        assert len(autos) == 2
        ids = {a["$id"] for a in autos}
        assert ids == {"a1", "a2"}


class TestOwnership:
    def test_patch_other_users_row_404(self, client, store):
        store.automations["auto_other"] = {
            "$id": "auto_other", "clerk_user_id": "other_user", "name": "Theirs"}
        r = client.patch("/automations/auto_other", json={"name": "Hacked"})
        assert r.status_code == 404

    def test_get_other_users_row_404(self, client, store):
        store.automations["auto_other"] = {
            "$id": "auto_other", "clerk_user_id": "other_user", "name": "Theirs"}
        r = client.get("/automations/auto_other")
        assert r.status_code == 404

    def test_delete_other_users_row_404(self, client, store):
        store.automations["auto_other"] = {
            "$id": "auto_other", "clerk_user_id": "other_user", "name": "Theirs"}
        r = client.delete("/automations/auto_other")
        assert r.status_code == 404

    def test_logs_other_users_row_404(self, client, store):
        store.automations["auto_other"] = {
            "$id": "auto_other", "clerk_user_id": "other_user", "name": "Theirs"}
        r = client.get("/automations/auto_other/logs")
        assert r.status_code == 404


class TestLogs:
    def test_list_logs_passthrough(self, client, store):
        store.automations["auto_1"] = {
            "$id": "auto_1", "clerk_user_id": "clerk_test_1", "name": "Mine"}
        store.logs["auto_1"] = [
            {"$id": "log1", "action": "dm_sent", "created_at": "2026-01-01T00:00:00"},
            {"$id": "log2", "action": "skipped", "created_at": "2026-01-01T00:01:00"},
        ]
        r = client.get("/automations/auto_1/logs")
        assert r.status_code == 200
        logs = r.json()["logs"]
        assert len(logs) == 2
        assert logs[0]["$id"] == "log1"
        assert logs[1]["$id"] == "log2"


class TestAuth:
    def test_no_auth_401(self, client):
        app.dependency_overrides.clear()
        r = client.get("/automations")
        assert r.status_code == 401
        assert r.json()["error"] == "unauthorized"


class TestTemplates:
    def test_list_templates_returns_8(self, client):
        r = client.get("/automations/templates")
        assert r.status_code == 200
        body = r.json()
        templates = body["templates"]
        assert len(templates) == 8
        slugs = {t["slug"] for t in templates}
        expected = {
            "dtc-product-link", "real-estate-lead-form", "fitness-plan",
            "course-webinar", "beauty-price-list", "restaurant-menu",
            "event-rsvp", "creator-media-kit",
        }
        assert slugs == expected
        # Verify shape of first template
        t0 = templates[0]
        assert "title" in t0
        assert "keywords" in t0
        assert "dm_message" in t0
        assert isinstance(t0["keywords"], list)
        assert len(t0["keywords"]) >= 1

    def test_templates_route_before_automation_id(self, client):
        """Verify /automations/templates is not swallowed by /{automation_id}."""
        r = client.get("/automations/templates")
        assert r.status_code == 200
        assert "templates" in r.json()


class TestAutomationStats:
    def test_automation_stats_shape(self, client, store):
        store.automations["auto_1"] = {
            "$id": "auto_1", "clerk_user_id": "clerk_test_1", "name": "Mine"}
        store.logs["auto_1"] = [
            {"$id": "l1", "automation_id": "auto_1", "action": "dm_sent",
             "matched_keyword": "LINK", "created_at": "2026-07-29T00:00:00Z"},
            {"$id": "l2", "automation_id": "auto_1", "action": "dm_sent",
             "matched_keyword": "LINK", "created_at": "2026-07-28T00:00:00Z"},
            {"$id": "l3", "automation_id": "auto_1", "action": "skipped",
             "matched_keyword": None, "created_at": "2026-07-27T00:00:00Z"},
            {"$id": "l4", "automation_id": "auto_1", "action": "failed",
             "matched_keyword": "SHOP", "created_at": "2026-07-26T00:00:00Z"},
            {"$id": "l5", "automation_id": "auto_1", "action": "button_dm_sent",
             "matched_keyword": "LINK", "created_at": "2026-07-25T00:00:00Z"},
        ]
        store.tracked_links["s1"] = {
            "$id": "s1", "automation_id": "auto_1", "target_url": "https://example.com"}
        store.link_clicks["s1"] = [
            {"slug": "s1", "clicked_at": "2026-07-29T00:00:00Z"},
            {"slug": "s1", "clicked_at": "2026-07-28T00:00:00Z"},
        ]

        r = client.get("/automations/auto_1/stats")
        assert r.status_code == 200
        body = r.json()
        assert body["sent"] == 3  # dm_sent(2) + button_dm_sent(1)
        assert body["skipped"] == 1
        assert body["failed"] == 1
        assert body["clicks"] == 2
        assert body["ctr"] == round(2 / 3, 2)
        assert body["top_keywords"] == [["LINK", 3], ["SHOP", 1]]
        assert len(body["daily"]) == 7
        # Verify daily has the right shape
        for entry in body["daily"]:
            assert "date" in entry
            assert "sent" in entry

    def test_automation_stats_no_tracked_link(self, client, store):
        store.automations["auto_1"] = {
            "$id": "auto_1", "clerk_user_id": "clerk_test_1", "name": "Mine"}
        r = client.get("/automations/auto_1/stats")
        assert r.status_code == 200
        body = r.json()
        assert body["clicks"] == 0
        assert body["ctr"] == 0

    def test_automation_stats_other_user_404(self, client, store):
        store.automations["auto_other"] = {
            "$id": "auto_other", "clerk_user_id": "other_user", "name": "Theirs"}
        r = client.get("/automations/auto_other/stats")
        assert r.status_code == 404


class TestOverviewStats:
    def test_overview_stats_shape(self, client, store):
        store.automations["auto_1"] = {
            "$id": "auto_1", "clerk_user_id": "clerk_test_1", "name": "Active 1",
            "status": "active"}
        store.automations["auto_2"] = {
            "$id": "auto_2", "clerk_user_id": "clerk_test_1", "name": "Active 2",
            "status": "active"}
        store.automations["auto_3"] = {
            "$id": "auto_3", "clerk_user_id": "clerk_test_1", "name": "Paused",
            "status": "paused"}
        store.logs["auto_1"] = [
            {"$id": "l1", "automation_id": "auto_1", "action": "dm_sent",
             "clerk_user_id": "clerk_test_1", "matched_keyword": "LINK",
             "created_at": "2026-07-29T00:00:00Z"},
            {"$id": "l2", "automation_id": "auto_1", "action": "dm_sent",
             "clerk_user_id": "clerk_test_1", "matched_keyword": "LINK",
             "created_at": "2026-07-28T00:00:00Z"},
        ]
        store.logs["auto_2"] = [
            {"$id": "l3", "automation_id": "auto_2", "action": "button_dm_sent",
             "clerk_user_id": "clerk_test_1", "matched_keyword": "SHOP",
             "created_at": "2026-07-27T00:00:00Z"},
        ]
        store.tracked_links["s1"] = {
            "$id": "s1", "automation_id": "auto_1", "target_url": "https://example.com"}
        store.link_clicks["s1"] = [
            {"slug": "s1", "clicked_at": "2026-07-29T00:00:00Z"},
        ]

        r = client.get("/automations/stats/overview")
        assert r.status_code == 200
        body = r.json()
        assert body["sent_7d"] == 3
        assert body["clicks_7d"] == 1
        assert body["ctr_7d"] == round(1 / 3, 2)
        assert body["top_keyword_7d"] == "LINK"
        assert body["active_automations"] == 2

    def test_overview_stats_empty(self, client, store):
        r = client.get("/automations/stats/overview")
        assert r.status_code == 200
        body = r.json()
        assert body["sent_7d"] == 0
        assert body["clicks_7d"] == 0
        assert body["ctr_7d"] == 0
        assert body["top_keyword_7d"] == ""
        assert body["active_automations"] == 0

    def test_overview_route_before_automation_id(self, client):
        """Verify /automations/stats/overview is not swallowed by /{automation_id}."""
        r = client.get("/automations/stats/overview")
        assert r.status_code == 200
        assert "sent_7d" in r.json()
