# api/automation_worker.py
"""Comment automation worker — port of openreply's lib/queue/dm-worker.ts
processComment (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang).

Pipeline: load automations → keyword match → dedup → decrypt token →
rate check → pending log (slot reservation) → public reply FIRST → DM → log.
BullMQ retry is replaced by job-row attempts with backoff [5, 15, 45] min.

The Appwrite Python SDK is synchronous, so every `store.*` call is wrapped
with `await run_in_threadpool(...)` to keep the async worker off the event
loop. `automation_logs` has a UNIQUE index on (automation_id, comment_id)
(Task 2), so `store.create_log` can raise a duplicate-key error when two
workers/webhooks/reconcilers race — `AppwriteException` code 409 is caught
and treated as "already handled → skip".
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone

from appwrite.exception import AppwriteException
from loguru import logger
from starlette.concurrency import run_in_threadpool

from api import graph_client
from api.graph_client import GraphRateLimitError, MetaApiError, TokenExpiredError
from api.keyword_matcher import match_keywords
from api.rate_limiter import check_dm_rate
from api.token_crypto import decrypt_or_plaintext, get_token_crypto

BACKOFF_MINUTES = [5, 15, 45]
MAX_ATTEMPTS = 3
STALE_PROCESSING_MINUTES = 10
REQUEUE_DELAY_MINUTES = 30


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _is_duplicate_key(exc: AppwriteException) -> bool:
    return getattr(exc, "code", None) == 409


def personalize(text: str, commenter_name: str | None) -> str:
    """{username} -> commenter name (or 'there') — port of renderMessage* personalization."""
    return re.sub(r"\{username\}", lambda _: commenter_name or "there", text or "", flags=re.IGNORECASE)


async def process_comment_event(store, event: dict, requeue_attempt: int = 0) -> str:
    """Process one comment across all matching automations.

    Returns 'done' or 'requeue'. Raises MetaApiError for job-level retry.
    """
    ig_id = event["instagram_account_id"]
    all_active = await run_in_threadpool(store.list_active_for_ig, ig_id)
    automations = [
        a for a in all_active
        if a["target_type"] == "all_posts"
        or event["media_id"] in (a.get("media_ids") or [])
        or event["media_id"] in (a.get("bound_media_ids") or [])
    ]

    for auto in automations:
        # STEP 2: keyword match
        m = match_keywords(
            event["comment_text"],
            auto.get("keywords") or [],
            whole_word_match=auto.get("match_mode", "whole_word") == "whole_word",
        )
        if not m.matched:
            continue

        # STEP 3: dedup — terminal states only. A "pending"/"failed" log is a
        # reservation from an earlier attempt; it is reused (STEP 6) so job
        # retries re-attempt the DM instead of dead-ending (matches openreply,
        # which skips only SENT / SKIPPED_PLAN_LIMIT).
        existing = await run_in_threadpool(store.find_log, auto["$id"], event["comment_id"])
        if existing and existing.get("action") in ("dm_sent", "button_dm_sent", "skipped"):
            continue

        # STEP 4: token
        creator = await run_in_threadpool(store.get_creator_by_clerk_id, auto["clerk_user_id"])
        if not creator or not creator.get("access_token"):
            await _fail_log(store, existing, auto, event, "no_access_token")
            continue
        try:
            token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
        except Exception:
            await _fail_log(store, existing, auto, event, "token_decrypt_failed")
            continue

        # STEP 5: rate check (before creating the reservation row)
        rate = await run_in_threadpool(check_dm_rate, store, ig_id, requeue_attempt)
        if not rate.allowed:
            if rate.should_skip:
                await _fail_log(store, existing, auto, event, "skipped_rate_limit")
                continue
            return "requeue"

        # STEP 6: pending log = rate slot reservation + dedup anchor
        if existing:
            log = existing
        else:
            try:
                log = await run_in_threadpool(store.create_log, {
                    "automation_id": auto["$id"],
                    "clerk_user_id": auto["clerk_user_id"],
                    "ig_user_id": ig_id,
                    "media_id": event["media_id"],
                    "comment_id": event["comment_id"],
                    "commenter_username": event.get("commenter_name"),
                    "comment_text": (event.get("comment_text") or "")[:1000],
                    "matched_keyword": m.matched_keyword,
                    "action": "pending",
                    "created_at": _now().isoformat(),
                })
            except AppwriteException as exc:
                if _is_duplicate_key(exc):
                    # Another worker/webhook/reconciler already reserved this
                    # (automation, comment) pair — treat as already handled.
                    continue
                raise

        try:
            # STEP 7: public reply FIRST (decoupled — its failure never blocks the DM)
            if auto.get("public_reply_enabled") and auto.get("public_reply_message"):
                try:
                    await graph_client.send_comment_reply(
                        event["comment_id"],
                        personalize(auto["public_reply_message"], event.get("commenter_name")),
                        access_token=token,
                    )
                except MetaApiError as exc:
                    logger.warning("public reply failed for automation {}: {}", auto["$id"], exc)

            # STEP 8: DM — direct or button mode
            if auto.get("opening_dm_mode") == "button" and auto.get("button_text") and auto.get("reveal_message"):
                await graph_client.send_private_reply_with_button(
                    ig_id, event["comment_id"],
                    personalize(auto["dm_message"], event.get("commenter_name")),
                    auto["button_text"], f"reveal:{auto['$id']}",
                    access_token=token)
                await run_in_threadpool(store.update_log, log["$id"], {"action": "button_dm_sent", "reason": None})
            else:
                await graph_client.send_private_reply(
                    ig_id,
                    event["comment_id"],
                    personalize(auto["dm_message"], event.get("commenter_name")),
                    access_token=token,
                )
                await run_in_threadpool(store.update_log, log["$id"], {"action": "dm_sent", "reason": None})

        except TokenExpiredError:
            await run_in_threadpool(
                store.update_automation, auto["$id"],
                {"status": "error", "updated_at": _now().isoformat()},
            )
            await run_in_threadpool(
                store.update_log, log["$id"],
                {"action": "failed", "reason": "token_expired"},
            )
        except GraphRateLimitError:
            return "requeue"

    return "done"


async def _fail_log(store, existing, auto, event, reason: str) -> None:
    action = "skipped" if reason.startswith("skipped") else "failed"
    try:
        if existing:
            await run_in_threadpool(store.update_log, existing["$id"], {"action": action, "reason": reason})
        else:
            await run_in_threadpool(store.create_log, {
                "automation_id": auto["$id"],
                "clerk_user_id": auto["clerk_user_id"],
                "ig_user_id": event["instagram_account_id"],
                "media_id": event["media_id"],
                "comment_id": event["comment_id"],
                "action": action,
                "reason": reason,
                "created_at": _now().isoformat(),
            })
    except AppwriteException as exc:
        if _is_duplicate_key(exc):
            # Race loser: a log row already exists for this (automation, comment).
            return
        raise


async def _run_send_reveal(store, payload: dict) -> None:
    """Execute a send_reveal job: load automation, decrypt token, send DM, log."""
    automation_id = payload.get("automation_id")
    user_id = payload.get("user_id")
    ig_id = payload.get("instagram_account_id")
    if not automation_id or not user_id or not ig_id:
        raise ValueError("send_reveal job missing required fields")

    auto = await run_in_threadpool(store.get_automation, automation_id)
    if not auto:
        raise ValueError(f"automation {automation_id} not found")

    if auto.get("ig_user_id") != ig_id:
        raise ValueError(f"automation {automation_id} ig_user_id mismatch")

    creator = await run_in_threadpool(store.get_creator_by_clerk_id, auto["clerk_user_id"])
    if not creator or not creator.get("access_token"):
        raise ValueError(f"no access_token for automation {automation_id}")

    token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
    reveal_message = auto.get("reveal_message") or "Here's the link you requested!"

    await graph_client.send_direct_message(
        ig_id, user_id,
        personalize(reveal_message, None),
        access_token=token)

    await run_in_threadpool(store.create_log, {
        "automation_id": automation_id,
        "clerk_user_id": auto["clerk_user_id"],
        "ig_user_id": ig_id,
        "media_id": "",
        "comment_id": f"postback:{user_id}",
        "commenter_username": None,
        "comment_text": None,
        "matched_keyword": None,
        "action": "reveal_sent",
        "created_at": _now().isoformat(),
    })


async def run_job(store, job_id: str) -> None:
    job = await run_in_threadpool(store.get_job, job_id)
    if not job or job.get("status") == "done":
        return
    now_iso = _now().isoformat()
    await run_in_threadpool(store.update_job, job_id, {"status": "processing", "updated_at": now_iso})
    try:
        payload = json.loads(job["payload"])

        if job.get("type") == "send_reveal":
            await _run_send_reveal(store, payload)
            now_iso = _now().isoformat()
            await run_in_threadpool(store.update_job, job_id, {"status": "done", "updated_at": now_iso})
            return

        result = await process_comment_event(store, payload, payload.get("requeue_attempt", 0))
        now_iso = _now().isoformat()
        if result == "requeue":
            payload["requeue_attempt"] = payload.get("requeue_attempt", 0) + 1
            await run_in_threadpool(store.update_job, job_id, {
                "status": "pending",
                "payload": json.dumps(payload),
                "run_at": (_now() + timedelta(minutes=REQUEUE_DELAY_MINUTES)).isoformat(),
                "updated_at": now_iso,
            })
        else:
            await run_in_threadpool(store.update_job, job_id, {"status": "done", "updated_at": now_iso})
    except MetaApiError as exc:
        now_iso = _now().isoformat()
        attempts = int(job.get("attempts", 0)) + 1
        if attempts >= MAX_ATTEMPTS:
            await run_in_threadpool(store.update_job, job_id, {"status": "failed", "attempts": attempts, "updated_at": now_iso})
            logger.error("job {} dead-lettered after {} attempts: {}", job_id, attempts, exc)
        else:
            await run_in_threadpool(store.update_job, job_id, {
                "status": "pending",
                "attempts": attempts,
                "run_at": (_now() + timedelta(minutes=BACKOFF_MINUTES[attempts - 1])).isoformat(),
                "updated_at": now_iso,
            })
    except Exception:
        now_iso = _now().isoformat()
        await run_in_threadpool(store.update_job, job_id, {"status": "failed", "attempts": int(job.get("attempts", 0)) + 1, "updated_at": now_iso})
        logger.exception("job {} failed unexpectedly", job_id)


async def run_job_safe(store, job_id: str) -> None:
    """BackgroundTasks entrypoint — must never raise."""
    try:
        await run_job(store, job_id)
    except Exception:
        logger.exception("run_job_safe swallowed error for job {}", job_id)


async def sweeper_loop(store, interval_seconds: int = 60) -> None:
    """Lifespan task: pick up due pending jobs and recover crashed processing jobs."""
    while True:
        try:
            now = _now()
            for job in await run_in_threadpool(store.list_due_jobs, now.isoformat()):
                await run_job_safe(store, job["$id"])
            stale_before = (now - timedelta(minutes=STALE_PROCESSING_MINUTES)).isoformat()
            for job in await run_in_threadpool(store.list_stale_processing_jobs, stale_before):
                attempts = int(job.get("attempts", 0)) + 1
                if attempts >= MAX_ATTEMPTS:
                    await run_in_threadpool(store.update_job, job["$id"], {"status": "failed", "attempts": attempts, "updated_at": _now().isoformat()})
                else:
                    await run_in_threadpool(store.update_job, job["$id"], {
                        "status": "pending",
                        "attempts": attempts,
                        "run_at": _now().isoformat(),
                        "updated_at": _now().isoformat(),
                    })
        except Exception:
            logger.exception("sweeper iteration failed")
        await asyncio.sleep(interval_seconds)
