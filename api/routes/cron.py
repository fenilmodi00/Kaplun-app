# api/routes/cron.py
"""Scheduled jobs — protected by a shared secret (X-Cron-Secret header).
Invoke from any scheduler (cron loop, GitHub Actions, uptime monitor)."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from loguru import logger
from starlette.concurrency import run_in_threadpool

from api.automation_store import get_automation_store
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
