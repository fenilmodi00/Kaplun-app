# api/routes/automations.py
"""Automation CRUD + activity logs. Clerk-JWT authed (same as app routes).
Ownership: every read/mutation verifies the row's clerk_user_id matches the
caller's; mismatches return 404."""
from __future__ import annotations

from datetime import datetime, timezone

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
