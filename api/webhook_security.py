# api/webhook_security.py
"""Webhook signature verification + event parsers — port of openreply's
lib/meta/webhook.ts (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang)."""
from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass


def verify_signature(raw_body: bytes, signature_header: str | None, secrets: list[str]) -> bool:
    if not signature_header or not secrets:
        return False
    for secret in secrets:
        expected = "sha256=" + hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if hmac.compare_digest(signature_header, expected):
            return True
    return False


@dataclass(frozen=True)
class CommentEvent:
    instagram_account_id: str
    comment_id: str
    comment_text: str
    commenter_id: str
    commenter_name: str | None
    media_id: str


@dataclass(frozen=True)
class PostbackEvent:
    instagram_account_id: str
    user_id: str
    payload: str
    mid: str | None


def parse_comment_events(payload: dict) -> list[CommentEvent]:
    events: list[CommentEvent] = []
    if payload.get("object") != "instagram":
        return events
    for entry in payload.get("entry") or []:
        for change in entry.get("changes") or []:
            if change.get("field") != "comments":
                continue
            value = change.get("value") or {}
            # Skip nested thread replies — only top-level comments should trigger automations.
            if value.get("parent_id"):
                continue
            comment_id = value.get("id") or value.get("comment_id")
            media_id = (value.get("media") or {}).get("id") or value.get("media_id")
            commenter_id = (value.get("from") or {}).get("id")
            if not (entry.get("id") and comment_id and media_id and commenter_id):
                continue
            if commenter_id == entry["id"]:  # skip own comments
                continue
            events.append(CommentEvent(
                instagram_account_id=entry["id"],
                comment_id=comment_id,
                comment_text=value.get("text") or "",
                commenter_id=commenter_id,
                commenter_name=(value.get("from") or {}).get("username"),
                media_id=media_id,
            ))
    return events


def parse_postback_events(payload: dict) -> list[PostbackEvent]:
    events: list[PostbackEvent] = []
    if payload.get("object") != "instagram":
        return events
    for entry in payload.get("entry") or []:
        for messaging in entry.get("messaging") or []:
            postback = messaging.get("postback") or {}
            user_id = (messaging.get("sender") or {}).get("id")
            account_id = entry.get("id") or (messaging.get("recipient") or {}).get("id")
            if not (postback.get("payload") and user_id and account_id) or user_id == account_id:
                continue
            events.append(PostbackEvent(account_id, user_id, postback["payload"], postback.get("mid")))
    return events
