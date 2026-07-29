# api/tests/test_automation_store.py
"""Tests for AutomationStore with an injected FakeTables (no network)."""
import json

import pytest
from appwrite.exception import AppwriteException

import api.automation_store as store_module
from api.automation_store import AutomationStore, get_automation_store


class FakeTables:
    """Records calls and returns canned responses keyed by (table_id, op)."""

    def __init__(self):
        self.calls = []  # (op, table_id, kwargs)
        self.list_responses = {}  # table_id -> {"rows": [...], "total": n}
        self.created_rows = []
        self.raise_on_get: AppwriteException | None = None  # raised from get_row when set

    def create_row(self, database_id, table_id, row_id, data, permissions=None, **kwargs):
        row = dict(data)
        row["$id"] = row_id
        self.calls.append(("create_row", table_id, {"row_id": row_id, "data": data}))
        self.created_rows.append(row)
        return row

    def list_rows(self, database_id, table_id, queries=None, **kwargs):
        self.calls.append(("list_rows", table_id, {"queries": queries or []}))
        return self.list_responses.get(table_id, {"rows": [], "total": 0})

    def get_row(self, database_id, table_id, row_id, **kwargs):
        self.calls.append(("get_row", table_id, {"row_id": row_id}))
        if self.raise_on_get is not None:
            raise self.raise_on_get
        return {"$id": row_id}

    def update_row(self, database_id, table_id, row_id, data=None, **kwargs):
        self.calls.append(("update_row", table_id, {"row_id": row_id, "data": data}))
        row = dict(data or {})
        row["$id"] = row_id
        return row

    def delete_row(self, database_id, table_id, row_id, **kwargs):
        self.calls.append(("delete_row", table_id, {"row_id": row_id}))
        return {}


def _queries(call):
    return [json.loads(q) for q in call[2]["queries"]]


def _list_calls(fake, table_id):
    return [c for c in fake.calls if c[0] == "list_rows" and c[1] == table_id]


# ── logs ──────────────────────────────────────────────────────────────────────


def test_find_log_none_when_no_rows():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    assert store.find_log("auto1", "c1") is None


def test_find_log_returns_row_when_present():
    fake = FakeTables()
    fake.list_responses["automation_logs"] = {
        "rows": [{"$id": "log1", "automation_id": "auto1", "comment_id": "c1"}],
        "total": 1,
    }
    store = AutomationStore(tables=fake)
    log = store.find_log("auto1", "c1")
    assert log is not None and log["$id"] == "log1"
    call = _list_calls(fake, "automation_logs")[0]
    queries = _queries(call)
    equals = {q["attribute"]: q["values"] for q in queries if q["method"] == "equal"}
    assert equals == {"automation_id": ["auto1"], "comment_id": ["c1"]}
    assert any(q["method"] == "limit" and q["values"] == [1] for q in queries)


def test_count_recent_dm_actions_returns_total_and_filters():
    fake = FakeTables()
    fake.list_responses["automation_logs"] = {"rows": [], "total": 42}
    store = AutomationStore(tables=fake)
    assert store.count_recent_dm_actions("ig1", "2026-07-29T00:00:00+00:00") == 42
    call = _list_calls(fake, "automation_logs")[0]
    queries = _queries(call)
    equals = {q["attribute"]: q["values"] for q in queries if q["method"] == "equal"}
    assert equals["ig_user_id"] == ["ig1"]
    assert equals["action"] == ["pending", "dm_sent", "button_dm_sent"]
    greater = [q for q in queries if q["method"] == "greaterThan"]
    assert greater and greater[0]["attribute"] == "created_at"
    assert greater[0]["values"] == ["2026-07-29T00:00:00+00:00"]


# ── automations ───────────────────────────────────────────────────────────────


def test_list_active_for_ig_issues_exactly_two_equal_filters():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    assert store.list_active_for_ig("ig1") == []
    call = _list_calls(fake, "automations")[0]
    queries = _queries(call)
    equals = [q for q in queries if q["method"] == "equal"]
    assert len(equals) == 2
    attrs = {q["attribute"]: q["values"] for q in equals}
    assert attrs == {"ig_user_id": ["ig1"], "status": ["active"]}


def test_list_all_active_automations_filters_on_status_only():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    store.list_all_active_automations()
    call = _list_calls(fake, "automations")[0]
    equals = [q for q in _queries(call) if q["method"] == "equal"]
    assert equals == [{"method": "equal", "attribute": "status", "values": ["active"]}]


def test_get_automation_none_on_404():
    fake = FakeTables()
    fake.raise_on_get = AppwriteException("Row not found", 404, "row_not_found")
    store = AutomationStore(tables=fake)
    assert store.get_automation("missing") is None


def test_get_automation_reraises_non_404():
    fake = FakeTables()
    fake.raise_on_get = AppwriteException("Server error", 500, "general_unknown")
    store = AutomationStore(tables=fake)
    with pytest.raises(AppwriteException):
        store.get_automation("auto1")


def test_create_automation_uses_unique_id():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    row = store.create_automation({"name": "x"})
    assert row["$id"]
    create_call = [c for c in fake.calls if c[0] == "create_row"][0]
    assert create_call[1] == "automations"
    assert create_call[2]["row_id"] and create_call[2]["row_id"] != "unique()"


# ── jobs ──────────────────────────────────────────────────────────────────────


def test_create_job_serializes_payload_and_defaults_run_at():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    job = store.create_job("process_comment", {"comment_id": "c1", "n": 1})
    assert json.loads(job["payload"]) == {"comment_id": "c1", "n": 1}
    assert job["status"] == "pending" and job["attempts"] == 0
    assert job["run_at"] and job["created_at"] and job["updated_at"]


def test_create_job_respects_explicit_run_at():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    job = store.create_job("process_comment", {}, run_at_iso="2030-01-01T00:00:00+00:00")
    assert job["run_at"] == "2030-01-01T00:00:00+00:00"


def test_list_due_jobs_filters_and_orders():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    store.list_due_jobs("2026-07-29T12:00:00+00:00", limit=7)
    call = _list_calls(fake, "automation_jobs")[0]
    queries = _queries(call)
    by_method = {}
    for q in queries:
        by_method.setdefault(q["method"], []).append(q)
    assert by_method["equal"] == [
        {"method": "equal", "attribute": "status", "values": ["pending"]}
    ]
    assert by_method["lessThanEqual"][0]["attribute"] == "run_at"
    assert by_method["orderAsc"][0]["attribute"] == "run_at"
    assert by_method["limit"][0]["values"] == [7]


def test_list_stale_processing_jobs_filters():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    store.list_stale_processing_jobs("2026-07-29T11:00:00+00:00")
    call = _list_calls(fake, "automation_jobs")[0]
    queries = _queries(call)
    equals = [q for q in queries if q["method"] == "equal"]
    assert equals == [{"method": "equal", "attribute": "status", "values": ["processing"]}]
    less_than = [q for q in queries if q["method"] == "lessThan"]
    assert less_than and less_than[0]["attribute"] == "updated_at"


# ── creators ──────────────────────────────────────────────────────────────────


def test_get_creator_by_clerk_id():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    assert store.get_creator_by_clerk_id("user_1") is None
    fake.list_responses["creators"] = {"rows": [{"$id": "cr1", "clerk_user_id": "user_1"}], "total": 1}
    creator = store.get_creator_by_clerk_id("user_1")
    assert creator is not None and creator["$id"] == "cr1"


def test_update_creator_token_writes_access_token_and_expiry():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    row = store.update_creator_token("cr1", "enc-token", "2026-09-01T00:00:00+00:00")
    assert row["access_token"] == "enc-token"
    assert row["token_expires_at"] == "2026-09-01T00:00:00+00:00"
    update_call = [c for c in fake.calls if c[0] == "update_row"][0]
    assert update_call[1] == "creators" and update_call[2]["row_id"] == "cr1"


def test_list_creators_with_token_expiring_before():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    store.list_creators_with_token_expiring_before("2026-08-01T00:00:00+00:00")
    call = _list_calls(fake, "creators")[0]
    queries = _queries(call)
    lte = [q for q in queries if q["method"] == "lessThanEqual"]
    order = [q for q in queries if q["method"] == "orderAsc"]
    assert lte and lte[0]["attribute"] == "token_expires_at"
    assert order and order[0]["attribute"] == "token_expires_at"


# ── tracked links ─────────────────────────────────────────────────────────────


def test_create_tracked_link_uses_slug_as_row_id():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    link = store.create_tracked_link("auto1", "https://example.com/p", "abc12345")
    assert link["$id"] == "abc12345"
    assert link["automation_id"] == "auto1"
    assert link["target_url"] == "https://example.com/p"
    assert link["created_at"]
    create_call = [c for c in fake.calls if c[0] == "create_row"][0]
    assert create_call[1] == "tracked_links"
    assert create_call[2]["row_id"] == "abc12345"


def test_get_tracked_link_none_on_404():
    fake = FakeTables()
    fake.raise_on_get = AppwriteException("Row not found", 404, "row_not_found")
    store = AutomationStore(tables=fake)
    assert store.get_tracked_link("nope") is None


def test_get_tracked_link_for_automation():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    assert store.get_tracked_link_for_automation("auto1") is None
    fake.list_responses["tracked_links"] = {
        "rows": [{"$id": "s1", "automation_id": "auto1", "target_url": "https://x.com"}],
        "total": 1,
    }
    link = store.get_tracked_link_for_automation("auto1")
    assert link is not None and link["$id"] == "s1"
    call = _list_calls(fake, "tracked_links")[-1]
    equals = [q for q in _queries(call) if q["method"] == "equal"]
    assert equals == [{"method": "equal", "attribute": "automation_id", "values": ["auto1"]}]


def test_record_click_creates_link_click_row_and_count_reads_total():
    fake = FakeTables()
    store = AutomationStore(tables=fake)
    store.record_click("abc12345")
    create_call = [c for c in fake.calls if c[0] == "create_row"][0]
    assert create_call[1] == "link_clicks"
    assert create_call[2]["data"]["slug"] == "abc12345"
    assert create_call[2]["data"]["clicked_at"]

    fake.list_responses["link_clicks"] = {"rows": [], "total": 7}
    assert store.count_clicks("abc12345") == 7
    call = _list_calls(fake, "link_clicks")[0]
    equals = [q for q in _queries(call) if q["method"] == "equal"]
    assert equals == [{"method": "equal", "attribute": "slug", "values": ["abc12345"]}]


# ── singleton ─────────────────────────────────────────────────────────────────


def test_get_automation_store_returns_singleton(monkeypatch):
    monkeypatch.setattr(store_module, "_automation_store", None)
    first = get_automation_store()
    second = get_automation_store()
    assert first is second
    monkeypatch.setattr(store_module, "_automation_store", None)
