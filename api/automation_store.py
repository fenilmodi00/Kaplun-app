# api/automation_store.py
"""Automation data access layer over Appwrite TablesDB.

Singleton wrapping `TablesDB` for the comment-automation engine's tables:
automations, automation_logs, automation_jobs, tracked_links, link_clicks,
webhook_events — plus reads/writes on the shared creators table.

Client construction mirrors api/appwrite_client.py (same APPWRITE_ENDPOINT /
APPWRITE_PROJECT_ID / APPWRITE_API_KEY / APPWRITE_DATABASE_ID env vars);
table IDs come from the Task 2 env vars (see api/.env.example).

The Appwrite Python SDK is synchronous; async callers (worker, webhook,
sweeper, cron) must wrap store calls with `await run_in_threadpool(...)`.
"""

from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from typing import Any

from appwrite.client import Client
from appwrite.exception import AppwriteException
from appwrite.id import ID
from appwrite.query import Query
from appwrite.services.tables_db import TablesDB

# ── Env vars ──────────────────────────────────────────────────────────────────

APPWRITE_ENDPOINT: str = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID: str = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY: str = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID: str = os.getenv("APPWRITE_DATABASE_ID", "vernacular_saas")

APPWRITE_CREATORS_TABLE_ID: str = os.getenv("APPWRITE_CREATORS_TABLE_ID", "creators")
APPWRITE_AUTOMATIONS_TABLE_ID: str = os.getenv("APPWRITE_AUTOMATIONS_TABLE_ID", "automations")
APPWRITE_AUTOMATION_LOGS_TABLE_ID: str = os.getenv("APPWRITE_AUTOMATION_LOGS_TABLE_ID", "automation_logs")
APPWRITE_AUTOMATION_JOBS_TABLE_ID: str = os.getenv("APPWRITE_AUTOMATION_JOBS_TABLE_ID", "automation_jobs")
APPWRITE_TRACKED_LINKS_TABLE_ID: str = os.getenv("APPWRITE_TRACKED_LINKS_TABLE_ID", "tracked_links")
APPWRITE_LINK_CLICKS_TABLE_ID: str = os.getenv("APPWRITE_LINK_CLICKS_TABLE_ID", "link_clicks")
APPWRITE_WEBHOOK_EVENTS_TABLE_ID: str = os.getenv("APPWRITE_WEBHOOK_EVENTS_TABLE_ID", "webhook_events")


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalize_row(row: Any) -> dict:
    """Return a plain dict for an SDK Row or a plain dict.

    SDK v21 returns pydantic `Row` models whose user fields live in `.data`;
    tests inject fakes that already return plain dicts. Either way the store
    returns dicts that include `$id`.
    """
    if isinstance(row, dict):
        return row
    data = getattr(row, "data", None)
    if isinstance(data, dict):
        out = dict(data)
        row_id = getattr(row, "id", None)
        if row_id is not None:
            out.setdefault("$id", row_id)
        return out
    if hasattr(row, "to_dict"):
        return dict(row.to_dict())
    return dict(row)


def _rows_and_total(result: Any) -> tuple[list[dict], int]:
    """Extract (rows, total) from an SDK RowList or a plain-dict fake."""
    if isinstance(result, dict):
        rows = result.get("rows") or []
        total = result.get("total", len(rows))
    else:
        rows = getattr(result, "rows", None) or []
        total = getattr(result, "total", len(rows))
    return [_normalize_row(r) for r in rows], int(total)


def _is_not_found(exc: AppwriteException) -> bool:
    return getattr(exc, "code", None) == 404


class AutomationStore:
    """Thin typed wrapper over TablesDB for the automation tables.

    Constructor takes an optional `tables` param (a TablesDB instance or a
    test fake) so tests can inject a FakeTables without touching the network.
    """

    def __init__(self, tables: Any | None = None) -> None:
        if tables is not None:
            self._tables = tables
        else:
            client = Client()
            client.set_endpoint(APPWRITE_ENDPOINT)
            client.set_project(APPWRITE_PROJECT_ID)
            client.set_key(APPWRITE_API_KEY)
            self._tables = TablesDB(client)

    # ── automations ───────────────────────────────────────────────────────────

    def create_automation(self, data: dict) -> dict:
        row = self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            row_id=ID.unique(),
            data=data,
        )
        return _normalize_row(row)

    def list_automations(self, clerk_user_id: str) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            queries=[
                Query.equal("clerk_user_id", clerk_user_id),
                Query.order_desc("created_at"),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def get_automation(self, automation_id: str) -> dict | None:
        try:
            row = self._tables.get_row(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
                row_id=automation_id,
            )
        except AppwriteException as exc:
            if _is_not_found(exc):
                return None
            raise
        return _normalize_row(row)

    def update_automation(self, automation_id: str, data: dict) -> dict:
        row = self._tables.update_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            row_id=automation_id,
            data=data,
        )
        return _normalize_row(row)

    def delete_automation(self, automation_id: str) -> None:
        self._tables.delete_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            row_id=automation_id,
        )

    def list_active_for_ig(self, ig_user_id: str) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            queries=[
                Query.equal("ig_user_id", ig_user_id),
                Query.equal("status", "active"),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def list_all_active_automations(self) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATIONS_TABLE_ID,
            queries=[Query.equal("status", "active")],
        )
        rows, _ = _rows_and_total(result)
        return rows

    # ── logs ──────────────────────────────────────────────────────────────────

    def create_log(self, data: dict) -> dict:
        row = self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            row_id=ID.unique(),
            data=data,
        )
        return _normalize_row(row)

    def find_log(self, automation_id: str, comment_id: str) -> dict | None:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("automation_id", automation_id),
                Query.equal("comment_id", comment_id),
                Query.limit(1),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows[0] if rows else None

    def update_log(self, log_id: str, data: dict) -> dict:
        row = self._tables.update_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            row_id=log_id,
            data=data,
        )
        return _normalize_row(row)

    def list_logs(self, automation_id: str, limit: int = 100) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("automation_id", automation_id),
                Query.order_desc("created_at"),
                Query.limit(limit),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def list_recent_logs_for_user(self, clerk_user_id: str, limit: int = 20) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("clerk_user_id", clerk_user_id),
                Query.order_desc("created_at"),
                Query.limit(limit),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def count_recent_dm_actions(self, ig_user_id: str, since_iso: str) -> int:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("ig_user_id", ig_user_id),
                Query.greater_than("created_at", since_iso),
                Query.equal("action", ["pending", "dm_sent", "button_dm_sent"]),
                Query.limit(1),
            ],
        )
        _, total = _rows_and_total(result)
        return total

    # ── jobs ──────────────────────────────────────────────────────────────────

    def create_job(self, type_: str, payload: dict, run_at_iso: str | None = None) -> dict:
        now = _utc_now_iso()
        row = self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
            row_id=ID.unique(),
            data={
                "type": type_,
                "payload": json.dumps(payload),
                "status": "pending",
                "attempts": 0,
                "run_at": run_at_iso or now,
                "created_at": now,
                "updated_at": now,
            },
        )
        return _normalize_row(row)

    def get_job(self, job_id: str) -> dict | None:
        try:
            row = self._tables.get_row(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
                row_id=job_id,
            )
        except AppwriteException as exc:
            if _is_not_found(exc):
                return None
            raise
        return _normalize_row(row)

    def update_job(self, job_id: str, data: dict) -> dict:
        row = self._tables.update_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
            row_id=job_id,
            data=data,
        )
        return _normalize_row(row)

    def list_due_jobs(self, now_iso: str, limit: int = 25) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
            queries=[
                Query.equal("status", "pending"),
                Query.less_than_equal("run_at", now_iso),
                Query.order_asc("run_at"),
                Query.limit(limit),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def list_stale_processing_jobs(self, stale_before_iso: str, limit: int = 100) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
            queries=[
                Query.equal("status", "processing"),
                Query.less_than("updated_at", stale_before_iso),
                Query.limit(limit),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    # ── creators ──────────────────────────────────────────────────────────────

    def get_creator_by_clerk_id(self, clerk_user_id: str) -> dict | None:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_CREATORS_TABLE_ID,
            queries=[
                Query.equal("clerk_user_id", clerk_user_id),
                Query.limit(1),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows[0] if rows else None

    def list_creators_with_token_expiring_before(self, iso: str) -> list[dict]:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_CREATORS_TABLE_ID,
            queries=[
                Query.less_than_equal("token_expires_at", iso),
                Query.order_asc("token_expires_at"),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows

    def update_creator_token(self, creator_id: str, encrypted_token: str, expires_at_iso: str) -> dict:
        row = self._tables.update_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_CREATORS_TABLE_ID,
            row_id=creator_id,
            data={
                "access_token": encrypted_token,
                "token_expires_at": expires_at_iso,
            },
        )
        return _normalize_row(row)

    # ── tracked links ─────────────────────────────────────────────────────────

    def create_tracked_link(self, automation_id: str, target_url: str, slug: str) -> dict:
        # Row $id IS the slug — the redirect route looks links up by it.
        row = self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_TRACKED_LINKS_TABLE_ID,
            row_id=slug,
            data={
                "automation_id": automation_id,
                "target_url": target_url,
                "created_at": _utc_now_iso(),
            },
        )
        return _normalize_row(row)

    def get_tracked_link(self, slug: str) -> dict | None:
        try:
            row = self._tables.get_row(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_TRACKED_LINKS_TABLE_ID,
                row_id=slug,
            )
        except AppwriteException as exc:
            if _is_not_found(exc):
                return None
            raise
        return _normalize_row(row)

    def get_tracked_link_for_automation(self, automation_id: str) -> dict | None:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_TRACKED_LINKS_TABLE_ID,
            queries=[
                Query.equal("automation_id", automation_id),
                Query.limit(1),
            ],
        )
        rows, _ = _rows_and_total(result)
        return rows[0] if rows else None

    def record_click(self, slug: str) -> None:
        self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_LINK_CLICKS_TABLE_ID,
            row_id=ID.unique(),
            data={
                "slug": slug,
                "clicked_at": _utc_now_iso(),
            },
        )

    def count_clicks(self, slug: str) -> int:
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_LINK_CLICKS_TABLE_ID,
            queries=[
                Query.equal("slug", slug),
                Query.limit(1),
            ],
        )
        _, total = _rows_and_total(result)
        return total

    def count_clicks_since(self, slug: str, since_iso: str) -> int:
        """Count link clicks for a slug created after a given timestamp."""
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_LINK_CLICKS_TABLE_ID,
            queries=[
                Query.equal("slug", slug),
                Query.greater_than("clicked_at", since_iso),
                Query.limit(1),
            ],
        )
        _, total = _rows_and_total(result)
        return total

    # ── webhook events ─────────────────────────────────────────────────────────

    def record_webhook_event(self, payload: str) -> None:
        """Persist a raw webhook payload for debugging.

        Payloads longer than 16 000 characters are truncated before insert.
        """
        if len(payload) > 16000:
            payload = payload[:16000]
        self._tables.create_row(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_WEBHOOK_EVENTS_TABLE_ID,
            row_id=ID.unique(),
            data={
                "payload": payload,
                "received_at": _utc_now_iso(),
            },
        )

    # ── retention ──────────────────────────────────────────────────────────────

    def delete_logs_older_than(self, cutoff_iso: str) -> int:
        """Delete automation_log rows with created_at < cutoff_iso.

        Paginates through results 100 at a time and deletes each row.
        Returns the total number of deleted rows.
        """
        total_deleted = 0
        offset = 0
        batch_size = 100
        while True:
            result = self._tables.list_rows(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
                queries=[
                    Query.less_than("created_at", cutoff_iso),
                    Query.limit(batch_size),
                    Query.offset(offset),
                ],
            )
            rows, _ = _rows_and_total(result)
            if not rows:
                break
            for row in rows:
                row_id = row.get("$id")
                if row_id:
                    self._tables.delete_row(
                        database_id=APPWRITE_DATABASE_ID,
                        table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
                        row_id=row_id,
                    )
                    total_deleted += 1
            offset += batch_size
        return total_deleted

    def delete_webhook_events_older_than(self, cutoff_iso: str) -> int:
        """Delete webhook_event rows with received_at < cutoff_iso.

        Paginates through results 100 at a time and deletes each row.
        Returns the total number of deleted rows.
        """
        total_deleted = 0
        offset = 0
        batch_size = 100
        while True:
            result = self._tables.list_rows(
                database_id=APPWRITE_DATABASE_ID,
                table_id=APPWRITE_WEBHOOK_EVENTS_TABLE_ID,
                queries=[
                    Query.less_than("received_at", cutoff_iso),
                    Query.limit(batch_size),
                    Query.offset(offset),
                ],
            )
            rows, _ = _rows_and_total(result)
            if not rows:
                break
            for row in rows:
                row_id = row.get("$id")
                if row_id:
                    self._tables.delete_row(
                        database_id=APPWRITE_DATABASE_ID,
                        table_id=APPWRITE_WEBHOOK_EVENTS_TABLE_ID,
                        row_id=row_id,
                    )
                    total_deleted += 1
            offset += batch_size
        return total_deleted

    # ── health ─────────────────────────────────────────────────────────────────

    def count_jobs_by_status(self) -> dict[str, int]:
        """Count automation_jobs rows by status field.

        Returns {"pending": n, "processing": n, "failed": n, "done": n}.
        """
        counts: dict[str, int] = {"pending": 0, "processing": 0, "failed": 0, "done": 0}
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_JOBS_TABLE_ID,
            queries=[Query.limit(10000)],
        )
        rows, _ = _rows_and_total(result)
        for row in rows:
            status = row.get("status", "unknown")
            if status in counts:
                counts[status] += 1
        return counts

    def get_last_webhook_event_time(self) -> str | None:
        """Return the ISO timestamp of the most recent webhook event, or None."""
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_WEBHOOK_EVENTS_TABLE_ID,
            queries=[
                Query.order_desc("received_at"),
                Query.limit(1),
            ],
        )
        rows, _ = _rows_and_total(result)
        if rows:
            return rows[0].get("received_at")
        return None

    # ── stats ──────────────────────────────────────────────────────────────────

    def count_logs_by_action(self, automation_id: str) -> dict[str, int]:
        """Count automation logs by action type. Returns {action: count}."""
        logs = self.list_logs(automation_id, limit=10000)
        counts: dict[str, int] = {}
        for log in logs:
            action = log.get("action", "unknown")
            counts[action] = counts.get(action, 0) + 1
        return counts

    def count_logs_by_action_since(self, clerk_user_id: str, since_iso: str) -> dict[str, int]:
        """Count logs by action type for a user since a date. Returns {action: count}."""
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("clerk_user_id", clerk_user_id),
                Query.greater_than("created_at", since_iso),
                Query.limit(10000),
            ],
        )
        rows, _ = _rows_and_total(result)
        counts: dict[str, int] = {}
        for log in rows:
            action = log.get("action", "unknown")
            counts[action] = counts.get(action, 0) + 1
        return counts

    def top_keywords(self, clerk_user_id: str, since_iso: str, limit: int = 5) -> list[list]:
        """Get top matched keywords for a user since a date.

        Returns list of [keyword, count] pairs sorted descending by count.
        """
        result = self._tables.list_rows(
            database_id=APPWRITE_DATABASE_ID,
            table_id=APPWRITE_AUTOMATION_LOGS_TABLE_ID,
            queries=[
                Query.equal("clerk_user_id", clerk_user_id),
                Query.greater_than("created_at", since_iso),
                Query.limit(10000),
            ],
        )
        rows, _ = _rows_and_total(result)
        kw_counts: dict[str, int] = {}
        for log in rows:
            kw = log.get("matched_keyword")
            if kw:
                kw_counts[kw] = kw_counts.get(kw, 0) + 1
        sorted_kws = sorted(kw_counts.items(), key=lambda x: -x[1])
        return [[kw, count] for kw, count in sorted_kws[:limit]]


# ── Singleton ─────────────────────────────────────────────────────────────────

_automation_store: AutomationStore | None = None
_store_lock = threading.Lock()


def get_automation_store() -> AutomationStore:
    """Return the module-level singleton AutomationStore instance."""
    global _automation_store
    if _automation_store is None:
        with _store_lock:
            if _automation_store is None:
                _automation_store = AutomationStore()
    return _automation_store
