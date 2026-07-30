# api/routes/automations.py
"""Automation CRUD + activity logs. Clerk-JWT authed (same as app routes).
Ownership: every read/mutation verifies the row's clerk_user_id matches the
caller's; mismatches return 404."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field, field_validator

from api.auth import get_clerk_user_id
from api.automation_store import get_automation_store
from api.campaign_templates import CAMPAIGN_TEMPLATES
from api.tracked_links import extract_first_url, new_slug

router = APIRouter(prefix="/automations", tags=["automations"])


def require_clerk(authorization: str | None = Header(None)) -> str:
    if not authorization:
        raise HTTPException(status_code=401,
                            detail={"error": "unauthorized", "message": "Missing Authorization header"})
    return get_clerk_user_id(authorization)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class AutomationCreate(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    target_type: str = Field(pattern="^(all_posts|specific_posts|next_reel)$")
    media_ids: list[str] = []
    keywords: list[str] = Field(min_length=1)
    match_mode: str = Field(default="whole_word", pattern="^(whole_word|partial)$")
    dm_message: str = Field(min_length=1, max_length=2000)
    opening_dm_mode: str = Field(default="direct", pattern="^(direct|button)$")
    button_text: str | None = Field(default=None, max_length=20)
    reveal_message: str | None = Field(default=None, max_length=2000)
    public_reply_enabled: bool = False
    public_reply_message: str | None = Field(default=None, max_length=2000)
    track_links: bool = False

    @field_validator("keywords")
    @classmethod
    def _strip_keywords(cls, v: list[str]) -> list[str]:
        cleaned = [k.strip() for k in v if k.strip()]
        if not cleaned:
            raise ValueError("at least one non-empty keyword is required")
        return cleaned

    @field_validator("button_text")
    @classmethod
    def _button_text_required_in_button_mode(cls, v: str | None, info):
        if info.data.get("opening_dm_mode") == "button" and not (v or "").strip():
            raise ValueError("button_text is required when opening_dm_mode is 'button'")
        return v

    @field_validator("reveal_message")
    @classmethod
    def _reveal_message_required_in_button_mode(cls, v: str | None, info):
        if info.data.get("opening_dm_mode") == "button" and not (v or "").strip():
            raise ValueError("reveal_message is required when opening_dm_mode is 'button'")
        return v


class AutomationPatch(BaseModel):
    name: str | None = None
    keywords: list[str] | None = None
    match_mode: str | None = Field(default=None, pattern="^(whole_word|partial)$")
    dm_message: str | None = None
    opening_dm_mode: str | None = Field(default=None, pattern="^(direct|button)$")
    button_text: str | None = None
    reveal_message: str | None = None
    public_reply_enabled: bool | None = None
    public_reply_message: str | None = None
    track_links: bool | None = None
    status: str | None = Field(default=None, pattern="^(active|paused)$")
    target_type: str | None = Field(default=None, pattern="^(all_posts|specific_posts|next_reel)$")
    media_ids: list[str] | None = None


def _owned(store, automation_id: str, clerk_user_id: str) -> dict:
    row = store.get_automation(automation_id)
    if not row or row.get("clerk_user_id") != clerk_user_id:
        raise HTTPException(status_code=404, detail={"error": "not_found", "message": "Automation not found"})
    return row


@router.get("")
def list_automations(clerk_user_id: str = Depends(require_clerk)):
    return {"automations": get_automation_store().list_automations(clerk_user_id)}


@router.post("", status_code=201)
def create_automation(body: AutomationCreate, clerk_user_id: str = Depends(require_clerk)):
    if body.target_type == "specific_posts" and not body.media_ids:
        raise HTTPException(status_code=422, detail={
            "error": "validation", "message": "media_ids is required when target_type is specific_posts"})
    if body.public_reply_enabled and not (body.public_reply_message or "").strip():
        raise HTTPException(status_code=422, detail={
            "error": "validation", "message": "public_reply_message is required when public replies are enabled"})
    store = get_automation_store()
    creator = store.get_creator_by_clerk_id(clerk_user_id)
    if not creator or not creator.get("access_token"):
        raise HTTPException(status_code=409, detail={
            "error": "instagram_not_connected",
            "message": "Connect your Instagram professional account before creating automations"})
    now = _now_iso()
    row = store.create_automation({
        **body.model_dump(), "clerk_user_id": clerk_user_id,
        "ig_user_id": creator.get("ig_user_id", ""),
        "opening_dm_mode": "direct", "bound_media_ids": [],
        "status": "active", "created_at": now, "updated_at": now,
    })

    # Mint a tracked-link slug when track_links is enabled
    if body.track_links:
        target_url = extract_first_url(body.dm_message) or extract_first_url(body.reveal_message or "")
        if target_url:
            slug = new_slug()
            store.create_tracked_link(row["$id"], target_url, slug)

    return {"automation": row}


@router.get("/templates")
def list_templates():
    """Return static campaign templates (no auth required — they're public)."""
    return {"templates": CAMPAIGN_TEMPLATES}


@router.get("/stats/overview")
def overview_stats(clerk_user_id: str = Depends(require_clerk)):
    """Aggregated stats across all automations for the trailing 7 days."""
    store = get_automation_store()
    since_7d = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()

    action_counts = store.count_logs_by_action_since(clerk_user_id, since_7d)
    sent = (action_counts.get("dm_sent", 0) + action_counts.get("button_dm_sent", 0)
            + action_counts.get("reveal_sent", 0) + action_counts.get("reply_sent", 0))

    # Count clicks across all tracked links for user's automations
    automations = store.list_automations(clerk_user_id)
    active_count = sum(1 for a in automations if a.get("status") == "active")
    clicks_7d = 0
    for a in automations:
        link = store.get_tracked_link_for_automation(a["$id"])
        if link:
            clicks_7d += store.count_clicks_since(link["$id"], since_7d)

    ctr = round(clicks_7d / sent, 2) if sent > 0 else 0

    top_kws = store.top_keywords(clerk_user_id, since_7d, limit=1)
    top_kw = top_kws[0][0] if top_kws else ""

    return {
        "sent_7d": sent,
        "clicks_7d": clicks_7d,
        "ctr_7d": ctr,
        "top_keyword_7d": top_kw,
        "active_automations": active_count,
    }


@router.get("/{automation_id}")
def get_automation(automation_id: str, clerk_user_id: str = Depends(require_clerk)):
    return {"automation": _owned(get_automation_store(), automation_id, clerk_user_id)}


@router.patch("/{automation_id}")
def patch_automation(automation_id: str, body: AutomationPatch, clerk_user_id: str = Depends(require_clerk)):
    store = get_automation_store()
    _owned(store, automation_id, clerk_user_id)
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    data["updated_at"] = _now_iso()
    return {"automation": store.update_automation(automation_id, data)}


@router.delete("/{automation_id}", status_code=204)
def delete_automation(automation_id: str, clerk_user_id: str = Depends(require_clerk)):
    store = get_automation_store()
    _owned(store, automation_id, clerk_user_id)
    store.delete_automation(automation_id)
    return None


@router.get("/{automation_id}/logs")
def list_logs(automation_id: str, clerk_user_id: str = Depends(require_clerk)):
    store = get_automation_store()
    _owned(store, automation_id, clerk_user_id)
    return {"logs": store.list_logs(automation_id)}


@router.get("/{automation_id}/stats")
def automation_stats(automation_id: str, clerk_user_id: str = Depends(require_clerk)):
    """Per-automation stats: totals, top keywords, daily sent counts (7d)."""
    store = get_automation_store()
    _owned(store, automation_id, clerk_user_id)

    action_counts = store.count_logs_by_action(automation_id)
    sent = (action_counts.get("dm_sent", 0) + action_counts.get("button_dm_sent", 0)
            + action_counts.get("reveal_sent", 0) + action_counts.get("reply_sent", 0))
    skipped = action_counts.get("skipped", 0)
    failed = action_counts.get("failed", 0)

    # Clicks
    link = store.get_tracked_link_for_automation(automation_id)
    clicks = store.count_clicks(link["$id"]) if link else 0
    ctr = round(clicks / sent, 2) if sent > 0 else 0

    # Top keywords (all time)
    logs = store.list_logs(automation_id, limit=10000)
    kw_counts: dict[str, int] = {}
    for log in logs:
        kw = log.get("matched_keyword")
        if kw:
            kw_counts[kw] = kw_counts.get(kw, 0) + 1
    sorted_kws = sorted(kw_counts.items(), key=lambda x: -x[1])
    top_keywords = [[kw, count] for kw, count in sorted_kws[:10]]

    # Daily sent counts for trailing 7 days
    today = datetime.now(timezone.utc).date()
    daily_map: dict[str, int] = {}
    for i in range(7):
        d = (today - timedelta(days=i)).isoformat()
        daily_map[d] = 0

    for log in logs:
        action = log.get("action", "")
        if action in ("dm_sent", "button_dm_sent"):
            created = log.get("created_at", "")
            if created:
                log_date = created[:10]
                if log_date in daily_map:
                    daily_map[log_date] += 1

    daily = [{"date": d, "sent": daily_map[d]} for d in sorted(daily_map.keys())]

    return {
        "sent": sent,
        "skipped": skipped,
        "failed": failed,
        "clicks": clicks,
        "ctr": ctr,
        "top_keywords": top_keywords,
        "daily": daily,
    }
