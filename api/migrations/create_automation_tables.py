#!/usr/bin/env python3
"""Idempotent migration: create 6 automation tables in Appwrite TablesDB.

Usage:
    python api/migrations/create_automation_tables.py

Reads env vars from api/.env (via python-dotenv if available, else os.environ).
Skips tables/columns/indexes that already exist.
"""

from __future__ import annotations

import os
import sys
import time

# ── Load .env ──────────────────────────────────────────────────────────────────

try:
    from dotenv import load_dotenv

    dotenv_path = os.path.join(os.path.dirname(__file__), "..", ".env")
    load_dotenv(dotenv_path)
except ImportError:
    pass  # python-dotenv not installed; rely on os.environ

# ── Appwrite SDK ───────────────────────────────────────────────────────────────

from appwrite.client import Client
from appwrite.enums.order_by import OrderBy
from appwrite.enums.tables_db_index_type import TablesDBIndexType
from appwrite.exception import AppwriteException
from appwrite.services.tables_db import TablesDB

# ── Config ─────────────────────────────────────────────────────────────────────

APPWRITE_ENDPOINT = os.getenv("APPWRITE_ENDPOINT", "https://sgp.cloud.appwrite.io/v1")
APPWRITE_PROJECT_ID = os.getenv("APPWRITE_PROJECT_ID", "")
APPWRITE_API_KEY = os.getenv("APPWRITE_API_KEY", "")
APPWRITE_DATABASE_ID = os.getenv("APPWRITE_DATABASE_ID", "vernacular_saas")

# Table IDs (mirrors api/automation_store.py defaults)
TABLE_IDS = {
    "automations": os.getenv("APPWRITE_AUTOMATIONS_TABLE_ID", "automations"),
    "automation_logs": os.getenv("APPWRITE_AUTOMATION_LOGS_TABLE_ID", "automation_logs"),
    "automation_jobs": os.getenv("APPWRITE_AUTOMATION_JOBS_TABLE_ID", "automation_jobs"),
    "tracked_links": os.getenv("APPWRITE_TRACKED_LINKS_TABLE_ID", "tracked_links"),
    "link_clicks": os.getenv("APPWRITE_LINK_CLICKS_TABLE_ID", "link_clicks"),
    "webhook_events": os.getenv("APPWRITE_WEBHOOK_EVENTS_TABLE_ID", "webhook_events"),
}


def _ok(msg: str) -> None:
    print(f"  [OK] {msg}")


def _skip(msg: str) -> None:
    print(f"  [SKIP] {msg} (already exists)")


def _fail(msg: str) -> None:
    print(f"  [FAIL] {msg}")
    sys.exit(1)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _existing_table_ids(tables: TablesDB) -> set[str]:
    """Return set of table IDs that already exist in the database."""
    try:
        result = tables.list_tables(database_id=APPWRITE_DATABASE_ID)
        ids: set[str] = set()
        for t in getattr(result, "tables", result) if not hasattr(result, "tables") else result.tables:
            tid = getattr(t, "id", None) or getattr(t, "$id", None)
            if tid:
                ids.add(tid)
        return ids
    except AppwriteException as exc:
        print(f"  [WARN] Could not list tables: {exc}")
        return set()


def _existing_column_keys(tables: TablesDB, table_id: str) -> set[str]:
    """Return set of column keys that already exist in the table."""
    try:
        result = tables.list_columns(database_id=APPWRITE_DATABASE_ID, table_id=table_id)
        keys: set[str] = set()
        for c in getattr(result, "columns", result) if not hasattr(result, "columns") else result.columns:
            k = getattr(c, "key", None)
            if k:
                keys.add(k)
        return keys
    except AppwriteException:
        return set()


def _existing_index_keys(tables: TablesDB, table_id: str) -> set[str]:
    """Return set of index keys that already exist in the table."""
    try:
        result = tables.list_indexes(database_id=APPWRITE_DATABASE_ID, table_id=table_id)
        keys: set[str] = set()
        for idx in getattr(result, "indexes", result) if not hasattr(result, "indexes") else result.indexes:
            k = getattr(idx, "key", None)
            if k:
                keys.add(k)
        return keys
    except AppwriteException:
        return set()


def _ensure_table(
    tables: TablesDB,
    table_id: str,
    name: str,
    existing: set[str],
) -> bool:
    """Create table if it doesn't exist. Returns True if created, False if existed."""
    if table_id in existing:
        return False
    try:
        tables.create_table(
            database_id=APPWRITE_DATABASE_ID,
            table_id=table_id,
            name=name,
        )
        return True
    except AppwriteException as exc:
        if exc.code == 409:
            return False  # race: another process created it
        raise


def _ensure_column(
    tables: TablesDB,
    table_id: str,
    existing: set[str],
    col_type: str,
    key: str,
    **kwargs: object,
) -> bool:
    """Create column if it doesn't exist. Returns True if created."""
    if key in existing:
        return False
    method_name = f"create_{col_type}_column"
    method = getattr(tables, method_name, None)
    if method is None:
        _fail(f"Unknown column type '{col_type}'")
    try:
        method(
            database_id=APPWRITE_DATABASE_ID,
            table_id=table_id,
            key=key,
            **kwargs,
        )
        return True
    except AppwriteException as exc:
        if exc.code == 409:
            return False
        raise


def _ensure_index(
    tables: TablesDB,
    table_id: str,
    existing: set[str],
    key: str,
    columns: list[str],
    index_type: str = "key",
    orders: list[str] | None = None,
) -> bool:
    """Create index if it doesn't exist. Returns True if created."""
    if key in existing:
        return False
    try:
        order_enums = None
        if orders:
            order_enums = [OrderBy.ASC if o == "asc" else OrderBy.DESC for o in orders]
        tables.create_index(
            database_id=APPWRITE_DATABASE_ID,
            table_id=table_id,
            key=key,
            type=TablesDBIndexType.KEY,
            columns=columns,
            orders=order_enums,
        )
        return True
    except AppwriteException as exc:
        if exc.code == 409:
            return False
        raise


# ── Table definitions ──────────────────────────────────────────────────────────

TABLE_DEFS: list[dict] = [
    {
        "id": TABLE_IDS["automations"],
        "name": "Automations",
        "columns": [
            {"type": "varchar", "key": "clerk_user_id", "size": 255, "required": True},
            {"type": "varchar", "key": "ig_user_id", "size": 255, "required": True},
            {"type": "varchar", "key": "name", "size": 255, "required": True},
            {
                "type": "enum",
                "key": "target_type",
                "elements": ["all_posts", "specific_posts", "next_reel"],
                "required": True,
            },
            {"type": "varchar", "key": "media_ids", "size": 255, "required": True, "array": True},
            {"type": "varchar", "key": "bound_media_ids", "size": 255, "required": True, "array": True},
            {"type": "varchar", "key": "keywords", "size": 255, "required": True, "array": True},
            {
                "type": "enum",
                "key": "match_mode",
                "elements": ["whole_word", "partial"],
                "required": True,
            },
            {
                "type": "enum",
                "key": "opening_dm_mode",
                "elements": ["direct", "button"],
                "required": True,
            },
            {"type": "text", "key": "dm_message", "required": True},
            {"type": "varchar", "key": "button_text", "size": 255, "required": False},
            {"type": "text", "key": "reveal_message", "required": False},
            {"type": "boolean", "key": "track_links", "required": True},
            {"type": "boolean", "key": "public_reply_enabled", "required": True},
            {"type": "text", "key": "public_reply_message", "required": False},
            {
                "type": "enum",
                "key": "status",
                "elements": ["active", "paused", "error"],
                "required": True,
            },
            {"type": "datetime", "key": "created_at", "required": True},
            {"type": "datetime", "key": "updated_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_automations_clerk_user_id", "columns": ["clerk_user_id"]},
            {"key": "idx_automations_ig_user_id_status", "columns": ["ig_user_id", "status"]},
            {"key": "idx_automations_status", "columns": ["status"]},
        ],
    },
    {
        "id": TABLE_IDS["automation_logs"],
        "name": "Automation Logs",
        "columns": [
            {"type": "varchar", "key": "automation_id", "size": 255, "required": True},
            {"type": "varchar", "key": "clerk_user_id", "size": 255, "required": True},
            {"type": "varchar", "key": "ig_user_id", "size": 255, "required": True},
            {"type": "varchar", "key": "comment_id", "size": 255, "required": True},
            {"type": "varchar", "key": "commenter_username", "size": 255, "required": False},
            {"type": "text", "key": "comment_text", "required": False},
            {"type": "varchar", "key": "matched_keyword", "size": 255, "required": False},
            {
                "type": "enum",
                "key": "action",
                "elements": [
                    "pending",
                    "dm_sent",
                    "button_dm_sent",
                    "reveal_sent",
                    "reply_sent",
                    "skipped",
                    "failed",
                ],
                "required": True,
            },
            {"type": "varchar", "key": "reason", "size": 500, "required": False},
            {"type": "datetime", "key": "created_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_logs_automation_id_created", "columns": ["automation_id", "created_at"]},
            {"key": "idx_logs_automation_id_comment_id", "columns": ["automation_id", "comment_id"]},
            {"key": "idx_logs_clerk_user_id_created", "columns": ["clerk_user_id", "created_at"]},
            {"key": "idx_logs_ig_user_id_created_action", "columns": ["ig_user_id", "created_at", "action"]},
        ],
    },
    {
        "id": TABLE_IDS["automation_jobs"],
        "name": "Automation Jobs",
        "columns": [
            {"type": "varchar", "key": "type", "size": 255, "required": True},
            {"type": "longtext", "key": "payload", "required": True},
            {
                "type": "enum",
                "key": "status",
                "elements": ["pending", "processing", "failed", "done"],
                "required": True,
            },
            {"type": "integer", "key": "attempts", "required": True},
            {"type": "datetime", "key": "run_at", "required": True},
            {"type": "datetime", "key": "created_at", "required": True},
            {"type": "datetime", "key": "updated_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_jobs_status_run_at", "columns": ["status", "run_at"]},
            {"key": "idx_jobs_status_updated_at", "columns": ["status", "updated_at"]},
        ],
    },
    {
        "id": TABLE_IDS["tracked_links"],
        "name": "Tracked Links",
        "columns": [
            {"type": "varchar", "key": "automation_id", "size": 255, "required": True},
            {"type": "varchar", "key": "target_url", "size": 2048, "required": True},
            {"type": "datetime", "key": "created_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_tracked_links_automation_id", "columns": ["automation_id"]},
        ],
    },
    {
        "id": TABLE_IDS["link_clicks"],
        "name": "Link Clicks",
        "columns": [
            {"type": "varchar", "key": "slug", "size": 255, "required": True},
            {"type": "datetime", "key": "clicked_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_link_clicks_slug_clicked", "columns": ["slug", "clicked_at"]},
        ],
    },
    {
        "id": TABLE_IDS["webhook_events"],
        "name": "Webhook Events",
        "columns": [
            {"type": "longtext", "key": "payload", "required": True},
            {"type": "datetime", "key": "received_at", "required": True},
        ],
        "indexes": [
            {"key": "idx_webhook_events_received_at", "columns": ["received_at"]},
        ],
    },
]


# ── Main ───────────────────────────────────────────────────────────────────────


def main() -> None:
    if not APPWRITE_PROJECT_ID:
        _fail("APPWRITE_PROJECT_ID is not set")
    if not APPWRITE_API_KEY:
        _fail("APPWRITE_API_KEY is not set")

    client = Client()
    client.set_endpoint(APPWRITE_ENDPOINT)
    client.set_project(APPWRITE_PROJECT_ID)
    client.set_key(APPWRITE_API_KEY)
    tables = TablesDB(client)

    print(f"Database: {APPWRITE_DATABASE_ID}")
    print(f"Endpoint: {APPWRITE_ENDPOINT}")
    print()

    # Discover existing tables
    existing_tables = _existing_table_ids(tables)
    print(f"Existing tables: {len(existing_tables)} found")
    print()

    for td in TABLE_DEFS:
        table_id = td["id"]
        print(f"[{table_id}] ({td['name']})")

        # ── Table ──────────────────────────────────────────────────────────
        created = _ensure_table(tables, table_id, td["name"], existing_tables)
        if created:
            _ok("table created")
            # Refresh existing set so columns/indexes are created fresh
            existing_tables.add(table_id)
        else:
            _skip("table")

        # ── Columns ────────────────────────────────────────────────────────
        existing_cols = _existing_column_keys(tables, table_id)
        for col in td["columns"]:
            col_key = col["key"]
            col_type = col["type"]
            kwargs: dict = {k: v for k, v in col.items() if k not in ("type", "key")}
            if _ensure_column(tables, table_id, existing_cols, col_type, col_key, **kwargs):
                _ok(f"column {col_key} ({col_type})")
            else:
                _skip(f"column {col_key}")

        # ── Indexes ────────────────────────────────────────────────────────
        existing_idxs = _existing_index_keys(tables, table_id)
        for idx in td["indexes"]:
            idx_key = idx["key"]
            idx_columns = idx["columns"]
            if _ensure_index(tables, table_id, existing_idxs, idx_key, idx_columns):
                _ok(f"index {idx_key}")
            else:
                _skip(f"index {idx_key}")

        print()

    print("Migration complete.")
    sys.exit(0)


if __name__ == "__main__":
    main()
