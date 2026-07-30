# api/routes/cron.py
"""Scheduled jobs — protected by a shared secret (X-Cron-Secret header).
Invoke from any scheduler (cron loop, GitHub Actions, uptime monitor)."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from loguru import logger
from starlette.concurrency import run_in_threadpool

from api.automation_store import get_automation_store
from api.comment_reconciler import attach_next_reels, reconcile_once
from api.graph_client import refresh_long_lived_token
from api.token_crypto import decrypt_or_plaintext, get_token_crypto

router = APIRouter(prefix="/cron", tags=["cron"])
REFRESH_WINDOW_DAYS = 10


def _check_secret(x_cron_secret: str | None) -> None:
    if not x_cron_secret or x_cron_secret != os.getenv("CRON_SECRET"):
        raise HTTPException(status_code=401)


@router.post("/refresh-tokens")
async def refresh_tokens(x_cron_secret: str | None = Header(None)):
    _check_secret(x_cron_secret)
    store = get_automation_store()
    threshold = (datetime.now(timezone.utc) + timedelta(days=REFRESH_WINDOW_DAYS)).isoformat()
    refreshed, failed = 0, 0
    creators = await run_in_threadpool(store.list_creators_with_token_expiring_before, threshold)
    for creator in creators:
        # Only refresh OAuth-connected creators. Rows that hold only an
        # instagrapi session JSON have it in `ig_session_json`, not `access_token`.
        if not creator.get("access_token"):
            continue
        try:
            token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
            out = await refresh_long_lived_token(token)
            await run_in_threadpool(
                store.update_creator_token,
                creator["$id"],
                get_token_crypto().encrypt(out["access_token"]),
                (datetime.now(timezone.utc) + timedelta(seconds=out["expires_in"])).isoformat(),
            )
            refreshed += 1
        except Exception as exc:
            failed += 1
            logger.error("token refresh failed for creator {}: {}", creator.get("$id"), exc)
    return {"refreshed": refreshed, "failed": failed}


@router.post("/reconcile")
async def reconcile(x_cron_secret: str | None = Header(None)):
    """Polling safety net: scan active automations for unmatched comments
    (72h lookback) and auto-attach new reels for next_reel targets.

    Schedule: run every hour (or every 30 min during peak hours). The 72h
    lookback window overlaps with the webhook's real-time coverage, so a
    missed webhook is caught within at most one polling cycle.
    """
    _check_secret(x_cron_secret)
    store = get_automation_store()
    result = await reconcile_once(store)
    attached = await attach_next_reels(store)
    return {**result, "attached": attached}


@router.post("/retain-logs")
async def retain_logs(x_cron_secret: str | None = Header(None)):
    _check_secret(x_cron_secret)
    store = get_automation_store()
    cutoff = (datetime.now(timezone.utc) - timedelta(days=14)).isoformat()
    deleted_logs = await run_in_threadpool(store.delete_logs_older_than, cutoff)
    deleted_events = await run_in_threadpool(store.delete_webhook_events_older_than, cutoff)
    logger.info("retention: deleted {} log rows and {} webhook events older than {}", deleted_logs, deleted_events, cutoff)
    return {"deleted_logs": deleted_logs, "deleted_webhook_events": deleted_events}


@router.get("/health")
async def automation_health(x_cron_secret: str | None = Header(None)):
    """Worker health surface: job counts by status + last webhook event time.

    Intended for uptime monitoring — alert when `failed` grows or `pending`
    stays above 50 for an extended period.
    """
    _check_secret(x_cron_secret)
    store = get_automation_store()
    counts = await run_in_threadpool(store.count_jobs_by_status)
    last_webhook = await run_in_threadpool(store.get_last_webhook_event_time)
    return {
        "pending": counts.get("pending", 0),
        "processing": counts.get("processing", 0),
        "failed": counts.get("failed", 0),
        "done": counts.get("done", 0),
        "last_webhook_event_at": last_webhook,
    }
