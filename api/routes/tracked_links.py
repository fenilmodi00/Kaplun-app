# api/routes/tracked_links.py
"""Tracked-link redirect endpoint — GET /r/{slug} → 302 to target_url.

Click logging is synchronous (Appwrite TablesDB create_row); the redirect
response is returned immediately after recording the click.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse
from starlette.concurrency import run_in_threadpool

from api.automation_store import get_automation_store

router = APIRouter(tags=["tracked_links"])


@router.get("/r/{slug}")
async def tracked_redirect(slug: str):
    """Redirect *slug* to its target URL, recording a click.

    Returns 302 to ``link["target_url"]`` on success, 404 on unknown slug.
    """
    store = get_automation_store()
    link = await run_in_threadpool(store.get_tracked_link, slug)
    if not link:
        raise HTTPException(status_code=404, detail={
            "error": "not_found",
            "message": "Tracked link not found",
        })
    await run_in_threadpool(store.record_click, slug)
    return RedirectResponse(link["target_url"], status_code=302)
