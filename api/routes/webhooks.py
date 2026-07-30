# api/routes/webhooks.py
"""Meta webhook receiver. GET = verification handshake; POST = HMAC-verified
event intake -> durable job rows -> BackgroundTasks processing. Always 200
after a valid signature (Meta retries non-200s). Raw payload logging lands
in Task 27.

MIT License — Copyright (c) 2026 Anish Raj, Diwen Huang (openreply).
Ported from lib/meta/webhook.ts."""
from __future__ import annotations

import json
import os
from dataclasses import asdict

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import PlainTextResponse
from loguru import logger

from api.automation_store import get_automation_store
from api.automation_worker import run_job_safe
from api.webhook_security import parse_comment_events, parse_postback_events, verify_signature
from starlette.concurrency import run_in_threadpool

router = APIRouter(tags=["webhooks"])


@router.get("/webhooks/instagram")
async def webhook_verify(
    hub_mode: str | None = Query(None, alias="hub.mode"),
    hub_verify_token: str | None = Query(None, alias="hub.verify_token"),
    hub_challenge: str | None = Query(None, alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == os.getenv("WEBHOOK_VERIFY_TOKEN"):
        return PlainTextResponse(hub_challenge or "")
    raise HTTPException(status_code=403)


@router.post("/webhooks/instagram")
async def webhook_events(request: Request, background_tasks: BackgroundTasks):
    raw = await request.body()
    secrets = [s for s in (os.getenv("INSTAGRAM_APP_SECRET"), os.getenv("FACEBOOK_APP_SECRET")) if s]
    if not verify_signature(raw, request.headers.get("x-hub-signature-256"), secrets):
        raise HTTPException(status_code=401)

    # Always return 200 after a valid signature — Meta retries non-200s.
    # Any parse/storage failure is logged and handled by the reconciler (Task 25).
    try:
        payload = json.loads(raw.decode() or "{}")
    except Exception as exc:
        logger.warning("webhook payload is not valid JSON: {}", exc)
        return {"status": "ok"}

    store = get_automation_store()
    try:
        for event in parse_comment_events(payload):
            # Keep job payload small; the worker re-fetches comment text if needed.
            small_event = {**asdict(event), "comment_text": event.comment_text[:1500]}
            job = await run_in_threadpool(store.create_job, "process_comment", small_event)
            background_tasks.add_task(run_job_safe, store, job["$id"])
            logger.info("queued process_comment job {} for comment {}", job["$id"], event.comment_id)

        for event in parse_postback_events(payload):
            if event.payload.startswith("reveal:"):
                automation_id = event.payload.removeprefix("reveal:")
                job = await run_in_threadpool(store.create_job, "send_reveal", {
                    "instagram_account_id": event.instagram_account_id,
                    "user_id": event.user_id,
                    "automation_id": automation_id,
                })
                background_tasks.add_task(run_job_safe, store, job["$id"])
                logger.info("queued send_reveal job {} for user {}", job["$id"], event.user_id)
    except Exception as exc:
        logger.exception("webhook enqueue failed: {}", exc)

    return {"status": "ok"}
