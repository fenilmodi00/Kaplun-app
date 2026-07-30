# api/comment_reconciler.py
"""Polling safety net — catches comments webhooks miss. Port of openreply's
lib/polling/comment-reconciler.ts (MIT). For each active automation, scan the
target media's comments from the last 72h; enqueue unmatched ones as jobs.
Dedup in the worker makes double-processing a no-op.

Also attaches new reels to automations with target_type == "next_reel".

MIT License — Copyright (c) 2026 Anish Raj, Diwen Huang.
https://github.com/diwenne/openreply
"""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from loguru import logger
from starlette.concurrency import run_in_threadpool

from api import graph_client
from api.keyword_matcher import match_keywords
from api.token_crypto import decrypt_or_plaintext, get_token_crypto
from api.webhook_security import CommentEvent

LOOKBACK_HOURS = 72
MAX_MEDIA_PER_AUTOMATION = 10


async def reconcile_once(store) -> dict:
    """Scan every active automation's target media for unmatched comments
    within the last LOOKBACK_HOURS hours and enqueue process_comment jobs.

    Returns {"enqueued": int}.

    Schedule: run every hour (or every 30 min during peak hours). The 72h
    lookback window overlaps with the webhook's real-time coverage, so a
    missed webhook is caught within at most one polling cycle.
    """
    since_ms = int((datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).timestamp() * 1000)
    enqueued = 0
    autos = await run_in_threadpool(store.list_all_active_automations)
    for auto in autos:
        creator = await run_in_threadpool(store.get_creator_by_clerk_id, auto["clerk_user_id"])
        if not creator or not creator.get("access_token"):
            continue
        token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
        media_ids = list(auto.get("media_ids") or []) + list(auto.get("bound_media_ids") or [])
        if auto["target_type"] == "all_posts":
            try:
                media = await graph_client.get_user_media(limit=MAX_MEDIA_PER_AUTOMATION, access_token=token)
            except Exception as exc:
                logger.warning("reconciler: get_user_media failed for {}: {}", auto["$id"], exc)
                continue
            media_ids = [m["id"] for m in media]
        for media_id in media_ids[:MAX_MEDIA_PER_AUTOMATION]:
            try:
                comments = await graph_client.get_recent_media_comments(media_id, since_ms, access_token=token)
            except Exception as exc:
                logger.warning("reconciler: comments fetch failed for {}: {}", media_id, exc)
                continue
            for c in comments:
                commenter = c.get("from") or {}
                if commenter.get("id") == auto["ig_user_id"]:
                    continue
                if await run_in_threadpool(store.find_log, auto["$id"], c["id"]):
                    continue
                if not match_keywords(c.get("text") or "", auto.get("keywords") or [],
                                      auto.get("match_mode", "whole_word") == "whole_word").matched:
                    continue
                await run_in_threadpool(store.create_job, "process_comment", asdict(CommentEvent(
                    instagram_account_id=auto["ig_user_id"],
                    comment_id=c["id"],
                    comment_text=c.get("text") or "",
                    commenter_id=commenter.get("id", ""),
                    commenter_name=commenter.get("username"),
                    media_id=media_id,
                )))
                enqueued += 1
    return {"enqueued": enqueued}


async def attach_next_reels(store) -> int:
    """For each active automation with target_type == "next_reel", fetch the
    creator's newest media and append it to bound_media_ids if not already present.

    Returns the number of automations updated.

    Schedule: run alongside reconcile_once (every hour). The builder screen
    exposes the "Next reel" target; the worker already matches bound_media_ids.
    """
    attached = 0
    autos = await run_in_threadpool(store.list_all_active_automations)
    for auto in autos:
        if auto.get("target_type") != "next_reel":
            continue
        creator = await run_in_threadpool(store.get_creator_by_clerk_id, auto["clerk_user_id"])
        if not creator or not creator.get("access_token"):
            continue
        token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
        try:
            media = await graph_client.get_user_media(limit=1, access_token=token)
        except Exception as exc:
            logger.warning("attach_next_reels: get_user_media failed for {}: {}", auto["$id"], exc)
            continue
        if not media:
            continue
        newest_id = media[0]["id"]
        bound = list(auto.get("bound_media_ids") or [])
        if newest_id in bound:
            continue
        bound.append(newest_id)
        await run_in_threadpool(store.update_automation, auto["$id"], {"bound_media_ids": bound})
        attached += 1
        logger.info("attach_next_reels: appended media {} to automation {}", newest_id, auto["$id"])
    return attached
