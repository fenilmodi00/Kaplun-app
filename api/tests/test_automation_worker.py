# api/tests/test_automation_worker.py
"""Tests for api/automation_worker.py — in-memory fake store + monkeypatched
async graph_client stubs (no network, no Appwrite)."""
import json
from datetime import datetime, timezone

import pytest
from appwrite.exception import AppwriteException

from api import automation_worker, graph_client
from api.automation_worker import personalize, process_comment_event, run_job
from api.graph_client import MetaApiError, TokenExpiredError
from api.rate_limiter import RATE_LIMIT_MAX

EVENT = {
    "instagram_account_id": "ig1",
    "media_id": "m1",
    "comment_id": "c1",
    "comment_text": "Please send the link!",
    "commenter_name": "alice",
}

CREATOR = {"$id": "cr1", "clerk_user_id": "user1", "access_token": "plain-token"}


def make_automation(**overrides):
    auto = {
        "$id": "a1",
        "clerk_user_id": "user1",
        "ig_user_id": "ig1",
        "target_type": "all_posts",
        "keywords": ["link"],
        "match_mode": "whole_word",
        "dm_message": "Hi {username}, here is your link",
        "public_reply_enabled": True,
        "public_reply_message": "On it, {username}!",
        "status": "active",
    }
    auto.update(overrides)
    return auto


class FakeStore:
    def __init__(self, automations=None, creators=None, dm_count=0):
        self.automations = list(automations or [])
        self.creators = dict(creators or {})
        self.logs = {}
        self.jobs = {}
        self.dm_count = dm_count
        self.raise_409_on_create = False
        self._seq = 0

    # automations
    def list_active_for_ig(self, ig):
        return list(self.automations)

    def update_automation(self, auto_id, data):
        for a in self.automations:
            if a["$id"] == auto_id:
                a.update(data)
                return a
        raise KeyError(auto_id)

    # logs
    def find_log(self, automation_id, comment_id):
        for log in self.logs.values():
            if log["automation_id"] == automation_id and log["comment_id"] == comment_id:
                return log
        return None

    def create_log(self, data):
        if self.raise_409_on_create:
            raise AppwriteException("Row already exists", 409)
        self._seq += 1
        log = {"$id": f"log{self._seq}", **data}
        self.logs[log["$id"]] = log
        return log

    def update_log(self, log_id, data):
        self.logs[log_id].update(data)
        return self.logs[log_id]

    def count_recent_dm_actions(self, ig, since):
        return self.dm_count

    # creators
    def get_creator_by_clerk_id(self, clerk_id):
        return self.creators.get(clerk_id)

    # jobs
    def add_job(self, job_id, payload, status="pending", attempts=0, run_at=None, type_="comment"):
        now = datetime.now(timezone.utc).isoformat()
        job = {
            "$id": job_id,
            "type": type_,
            "payload": json.dumps(payload),
            "status": status,
            "attempts": attempts,
            "run_at": run_at or now,
            "created_at": now,
            "updated_at": now,
        }
        self.jobs[job_id] = job
        return job

    def get_job(self, job_id):
        return self.jobs.get(job_id)

    def update_job(self, job_id, data):
        self.jobs[job_id].update(data)
        return self.jobs[job_id]

    def get_automation(self, automation_id):
        for a in self.automations:
            if a["$id"] == automation_id:
                return a
        return None


@pytest.fixture
def calls():
    return []


@pytest.fixture
def graph_ok(monkeypatch, calls):
    """Happy-path graph stubs recording (kind, *args) in `calls`."""
    async def fake_reply(comment_id, message, *, access_token, client=None):
        calls.append(("reply", comment_id, message, access_token))
        return {}

    async def fake_dm(ig, comment_id, text, *, access_token, client=None):
        calls.append(("dm", ig, comment_id, text, access_token))
        return {}

    async def fake_button_dm(ig, comment_id, text, button_title, payload, *, access_token, client=None):
        calls.append(("button_dm", ig, comment_id, text, button_title, payload, access_token))
        return {}

    async def fake_direct_dm(ig, user_id, text, *, access_token, client=None):
        calls.append(("direct_dm", ig, user_id, text, access_token))
        return {}

    monkeypatch.setattr(graph_client, "send_comment_reply", fake_reply)
    monkeypatch.setattr(graph_client, "send_private_reply", fake_dm)
    monkeypatch.setattr(graph_client, "send_private_reply_with_button", fake_button_dm)
    monkeypatch.setattr(graph_client, "send_direct_message", fake_direct_dm)
    return calls


def _minutes_until(iso: str) -> float:
    return (datetime.fromisoformat(iso) - datetime.now(timezone.utc)).total_seconds() / 60


def test_personalize_username_fallback():
    assert personalize("Hi {username}!", "alice") == "Hi alice!"
    assert personalize("Hi {USERNAME}!", None) == "Hi there!"
    assert personalize(None, "alice") == ""


async def test_no_keyword_match_creates_no_logs_and_sends_nothing(graph_ok):
    store = FakeStore(
        automations=[make_automation(keywords=["zzz"])],
        creators={"user1": CREATOR},
    )
    result = await process_comment_event(store, EVENT)
    assert result == "done"
    assert store.logs == {}
    assert graph_ok == []


async def test_match_sends_public_reply_then_dm_and_marks_dm_sent(graph_ok):
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
    )
    result = await process_comment_event(store, EVENT)
    assert result == "done"

    # Public reply FIRST, then DM — pipeline order is the fidelity contract.
    assert [kind for kind, *_ in graph_ok] == ["reply", "dm"]
    _, reply_comment, reply_text, reply_token = graph_ok[0]
    assert reply_comment == "c1" and reply_text == "On it, alice!" and reply_token == "plain-token"
    _, dm_ig, dm_comment, dm_text, dm_token = graph_ok[1]
    assert (dm_ig, dm_comment) == ("ig1", "c1")
    assert dm_text == "Hi alice, here is your link" and dm_token == "plain-token"

    assert len(store.logs) == 1
    log = next(iter(store.logs.values()))
    assert log["action"] == "dm_sent"
    assert log["reason"] is None
    assert log["matched_keyword"] == "link"
    assert log["automation_id"] == "a1" and log["comment_id"] == "c1"


async def test_existing_dm_sent_log_dedups_all_sends(graph_ok):
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
    )
    store.create_log({
        "automation_id": "a1",
        "comment_id": "c1",
        "action": "dm_sent",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    result = await process_comment_event(store, EVENT)
    assert result == "done"
    assert graph_ok == []
    assert len(store.logs) == 1


async def test_rate_limited_event_returns_requeue_and_run_job_reschedules(graph_ok):
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
        dm_count=RATE_LIMIT_MAX,
    )
    result = await process_comment_event(store, EVENT, requeue_attempt=0)
    assert result == "requeue"
    assert graph_ok == []
    assert store.logs == {}  # rate check happens before the reservation row

    store.add_job("j1", {**EVENT, "requeue_attempt": 0})
    await run_job(store, "j1")
    job = store.jobs["j1"]
    assert job["status"] == "pending"
    assert job["attempts"] == 0
    payload = json.loads(job["payload"])
    assert payload["requeue_attempt"] == 1
    assert 28 < _minutes_until(job["run_at"]) < 32


async def test_token_expired_marks_automation_error_and_fails_log(monkeypatch, graph_ok):
    async def expired_dm(ig, comment_id, text, *, access_token, client=None):
        raise TokenExpiredError(190, "Session expired")

    monkeypatch.setattr(graph_client, "send_private_reply", expired_dm)
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
    )
    result = await process_comment_event(store, EVENT)  # must not raise
    assert result == "done"

    auto = store.automations[0]
    assert auto["status"] == "error"
    log = next(iter(store.logs.values()))
    assert log["action"] == "failed" and log["reason"] == "token_expired"


async def test_meta_api_error_retries_with_backoff_then_dead_letters(monkeypatch, graph_ok):
    async def broken_dm(ig, comment_id, text, *, access_token, client=None):
        raise MetaApiError(1, "boom")

    monkeypatch.setattr(graph_client, "send_private_reply", broken_dm)
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
    )
    store.add_job("j1", EVENT)

    await run_job(store, "j1")
    job = store.jobs["j1"]
    assert job["status"] == "pending" and job["attempts"] == 1
    assert 4 < _minutes_until(job["run_at"]) < 6

    await run_job(store, "j1")
    job = store.jobs["j1"]
    assert job["status"] == "pending" and job["attempts"] == 2
    assert 14 < _minutes_until(job["run_at"]) < 16

    await run_job(store, "j1")
    job = store.jobs["j1"]
    assert job["status"] == "failed" and job["attempts"] == 3


async def test_duplicate_log_create_race_is_skipped(graph_ok):
    """automation_logs UNIQUE (automation_id, comment_id): a 409 from create_log
    means another worker already reserved the pair — skip, don't send."""
    store = FakeStore(
        automations=[make_automation()],
        creators={"user1": CREATOR},
    )
    store.raise_409_on_create = True  # find_log returns None, but create loses the race
    result = await process_comment_event(store, EVENT)
    assert result == "done"
    assert graph_ok == []
    assert store.logs == {}


async def test_button_mode_calls_send_private_reply_with_button(graph_ok):
    """opening_dm_mode='button' → send_private_reply_with_button, log button_dm_sent."""
    store = FakeStore(
        automations=[make_automation(
            opening_dm_mode="button",
            button_text="Get link",
            reveal_message="Here's the secret link!",
        )],
        creators={"user1": CREATOR},
    )
    result = await process_comment_event(store, EVENT)
    assert result == "done"

    # Public reply first, then button DM
    assert [kind for kind, *_ in graph_ok] == ["reply", "button_dm"]

    _, dm_ig, dm_comment, dm_text, dm_button, dm_payload, dm_token = graph_ok[1]
    assert dm_ig == "ig1"
    assert dm_comment == "c1"
    assert dm_text == "Hi alice, here is your link"
    assert dm_button == "Get link"
    assert dm_payload == "reveal:a1"
    assert dm_token == "plain-token"

    log = next(iter(store.logs.values()))
    assert log["action"] == "button_dm_sent"
    assert log["reason"] is None


async def test_send_reveal_job_sends_direct_message(graph_ok):
    """send_reveal job → send_direct_message, log reveal_sent."""
    store = FakeStore(
        automations=[make_automation(reveal_message="Secret link: example.com")],
        creators={"user1": CREATOR},
    )
    store.add_job("j_reveal", {
        "instagram_account_id": "ig1",
        "user_id": "u42",
        "automation_id": "a1",
    }, type_="send_reveal")

    await run_job(store, "j_reveal")

    assert [kind for kind, *_ in graph_ok] == ["direct_dm"]
    _, ig, uid, text, token = graph_ok[0]
    assert ig == "ig1"
    assert uid == "u42"
    assert text == "Secret link: example.com"
    assert token == "plain-token"

    logs = [l for l in store.logs.values() if l["action"] == "reveal_sent"]
    assert len(logs) == 1
    assert logs[0]["comment_id"] == "postback:u42"
    assert logs[0]["automation_id"] == "a1"

    assert store.jobs["j_reveal"]["status"] == "done"
