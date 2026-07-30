# api/tests/test_tracked_links.py
"""Tests for tracked links — core module + redirect route.

Core module tests are pure function tests (no network, no Appwrite).
Redirect route tests use TestClient + a FakeStore with tracked-link methods.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.main import app
from api.tracked_links import (
    extract_first_url,
    new_slug,
    render_message_with_tracking,
)


# ── new_slug ───────────────────────────────────────────────────────────────────


class TestNewSlug:
    def test_generates_6_to_8_char_slug(self):
        slug = new_slug()
        assert isinstance(slug, str)
        assert 6 <= len(slug) <= 8
        assert slug.isalnum()  # only alphanumeric after strip of - and _

    def test_generates_unique_slugs(self):
        slugs = {new_slug() for _ in range(100)}
        assert len(slugs) == 100


# ── extract_first_url ──────────────────────────────────────────────────────────


class TestExtractFirstUrl:
    def test_returns_first_url(self):
        assert extract_first_url("Check https://x.com/p and http://y.com") == "https://x.com/p"

    def test_strips_trailing_punctuation(self):
        assert extract_first_url("See https://x.com/p!") == "https://x.com/p"
        assert extract_first_url("(https://x.com/p)") == "https://x.com/p"

    def test_returns_none_for_no_url(self):
        assert extract_first_url("no url here") is None

    def test_returns_none_for_none(self):
        assert extract_first_url(None) is None

    def test_returns_none_for_empty(self):
        assert extract_first_url("") is None


# ── render_message_with_tracking ───────────────────────────────────────────────


class TestRenderMessageWithTracking:
    """Ported from openreply's renderMessageWithTracking tests (MIT)."""

    def test_replaces_url_with_tracked_url(self):
        result = render_message_with_tracking(
            "Hey {username}: https://x.com/p",
            "fan",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == "Hey fan: https://api.example.com/r/abc"

    def test_link_placeholder_wins_over_raw_url(self):
        """{link} placeholder takes precedence over raw-URL replacement."""
        result = render_message_with_tracking(
            "Get it here: {link} — also at https://x.com/p",
            "alice",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        # {link} is replaced; the raw URL is NOT replaced because {link} wins
        assert result == "Get it here: https://api.example.com/r/abc — also at https://x.com/p"

    def test_username_null_falls_back_to_there(self):
        result = render_message_with_tracking(
            "Hey {username}: https://x.com/p",
            None,
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == "Hey there: https://api.example.com/r/abc"

    def test_no_tracked_url_returns_plain_personalized(self):
        result = render_message_with_tracking(
            "Hi {username}!",
            "bob",
            tracked_url=None,
            destination_url="https://x.com/p",
        )
        assert result == "Hi bob!"

    def test_no_destination_url_returns_plain_personalized(self):
        result = render_message_with_tracking(
            "Hi {username}!",
            "bob",
            tracked_url="https://api.example.com/r/abc",
            destination_url=None,
        )
        assert result == "Hi bob!"

    def test_trailing_slash_variant_replaced(self):
        """If destination_url has no trailing slash but message has one, still replace."""
        result = render_message_with_tracking(
            "Link: https://x.com/p/",
            "bob",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == "Link: https://api.example.com/r/abc"

    def test_message_is_none(self):
        result = render_message_with_tracking(
            None, "alice",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == ""

    def test_link_placeholder_case_insensitive(self):
        result = render_message_with_tracking(
            "Get it: {LINK}",
            "alice",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == "Get it: https://api.example.com/r/abc"

    def test_username_placeholder_case_insensitive(self):
        result = render_message_with_tracking(
            "Hi {USERNAME}: https://x.com/p",
            "alice",
            tracked_url="https://api.example.com/r/abc",
            destination_url="https://x.com/p",
        )
        assert result == "Hi alice: https://api.example.com/r/abc"


# ── Redirect route ─────────────────────────────────────────────────────────────


class FakeStore:
    """Minimal AutomationStore fake with tracked-link methods for route tests."""

    def __init__(self):
        self.tracked_links: dict[str, dict] = {}
        self.clicks: list[str] = []

    def get_tracked_link(self, slug: str) -> dict | None:
        return self.tracked_links.get(slug)

    def record_click(self, slug: str) -> None:
        self.clicks.append(slug)


@pytest.fixture(autouse=True)
def _patch_store(monkeypatch):
    import api.routes.tracked_links as routes_mod
    store = FakeStore()
    monkeypatch.setattr(routes_mod, "get_automation_store", lambda: store)
    return store


@pytest.fixture
def client():
    return TestClient(app)


class TestRedirectRoute:
    def test_known_slug_returns_302_and_records_click(self, client, _patch_store):
        store = _patch_store
        store.tracked_links["abc"] = {
            "$id": "abc",
            "target_url": "https://example.com/offer",
            "automation_id": "auto1",
        }
        r = client.get("/r/abc", follow_redirects=False)
        assert r.status_code == 302
        assert r.headers["location"] == "https://example.com/offer"
        assert store.clicks == ["abc"]

    def test_unknown_slug_returns_404(self, client, _patch_store):
        r = client.get("/r/unknown", follow_redirects=False)
        assert r.status_code == 404
        body = r.json()
        assert body["error"] == "not_found"
