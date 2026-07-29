# api/graph_client.py
"""Minimal async Meta Graph API v25.0 client — port of openreply's
lib/meta/client.ts (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang).

Only the functions the automation engine needs. Two deliberate renames vs the
original: PermissionError -> MetaPermissionError (don't shadow the builtin),
RateLimitError -> GraphRateLimitError (don't collide with instagrapi's).
"""
from __future__ import annotations

from datetime import datetime

import httpx

GRAPH_API_VERSION = "v25.0"
GRAPH_BASE = f"https://graph.instagram.com/{GRAPH_API_VERSION}"


class MetaApiError(Exception):
    def __init__(self, code: int, message: str, subcode: int | None = None, fbtrace_id: str | None = None):
        super().__init__(message)
        self.code, self.subcode, self.fbtrace_id = code, subcode, fbtrace_id


class TokenExpiredError(MetaApiError):
    pass


class GraphRateLimitError(MetaApiError):
    pass


class MetaPermissionError(MetaApiError):
    pass


def _handle(data: dict, status: int) -> dict:
    err = data.get("error")
    if err:
        code = err.get("code", status)
        msg = err.get("message", "Unknown Meta API error")
        sub = err.get("error_subcode")
        trace = err.get("fbtrace_id")
        if code == 190:
            raise TokenExpiredError(code, msg, sub, trace)
        if code in (368, 4, 17, 613, 32):
            raise GraphRateLimitError(code, msg, sub, trace)
        if code in (10, 100, 200):
            raise MetaPermissionError(code, msg, sub, trace)
        raise MetaApiError(code, msg, sub, trace)
    return data


async def _request(client: httpx.AsyncClient | None, method: str, url: str, **kwargs) -> dict:
    owns = client is None
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        resp = await c.request(method, url, **kwargs)
        return _handle(resp.json(), resp.status_code)
    finally:
        if owns:
            await c.aclose()


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


async def send_private_reply(ig_account_id: str, comment_id: str, text: str, *,
                             access_token: str, client=None) -> dict:
    return await _request(client, "POST", f"{GRAPH_BASE}/{ig_account_id}/messages",
                          headers=_auth(access_token),
                          json={"recipient": {"comment_id": comment_id}, "message": {"text": text}})


async def send_private_reply_with_button(ig_account_id: str, comment_id: str, text: str,
                                         button_title: str, payload: str, *,
                                         access_token: str, client=None) -> dict:
    return await _request(client, "POST", f"{GRAPH_BASE}/{ig_account_id}/messages",
                          headers=_auth(access_token),
                          json={"recipient": {"comment_id": comment_id},
                                "message": {"attachment": {"type": "template", "payload": {
                                    "template_type": "button", "text": text[:640],
                                    "buttons": [{"type": "postback", "title": button_title[:20],
                                                 "payload": payload}]}}}})


async def send_private_reply_with_link_button(ig_account_id: str, comment_id: str, text: str,
                                              button_title: str, url: str, *,
                                              access_token: str, client=None) -> dict:
    return await _request(client, "POST", f"{GRAPH_BASE}/{ig_account_id}/messages",
                          headers=_auth(access_token),
                          json={"recipient": {"comment_id": comment_id},
                                "message": {"attachment": {"type": "template", "payload": {
                                    "template_type": "button", "text": text[:640],
                                    "buttons": [{"type": "web_url", "url": url,
                                                 "title": button_title[:20]}]}}}})


async def send_direct_message(ig_account_id: str, user_id: str, text: str, *,
                              access_token: str, client=None) -> dict:
    return await _request(client, "POST", f"{GRAPH_BASE}/{ig_account_id}/messages",
                          headers=_auth(access_token),
                          json={"recipient": {"id": user_id}, "message": {"text": text}})


async def send_comment_reply(comment_id: str, message: str, *, access_token: str, client=None) -> dict:
    return await _request(client, "POST", f"{GRAPH_BASE}/{comment_id}/replies",
                          headers=_auth(access_token), json={"message": message})


def _ts_ms(iso: str) -> float:
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp() * 1000


async def get_recent_media_comments(media_id: str, since_ms: int, max_results: int = 800, *,
                                    access_token: str, client=None) -> list[dict]:
    owns = client is None
    c = client or httpx.AsyncClient(timeout=15.0)
    try:
        url: str | None = (
            f"{GRAPH_BASE}/{media_id}/comments"
            "?fields=id,text,timestamp,from,replies{from}&order=reverse_chronological"
            f"&limit=50&access_token={access_token}"
        )
        results: list[dict] = []
        while url and len(results) < max_results:
            data = _handle((await c.get(url)).json(), 200)
            page = data.get("data", [])
            results.extend(page)
            if page and page[-1].get("timestamp") and _ts_ms(page[-1]["timestamp"]) < since_ms:
                break
            url = data.get("paging", {}).get("next")
        return [r for r in results if not r.get("timestamp") or _ts_ms(r["timestamp"]) >= since_ms][:max_results]
    finally:
        if owns:
            await c.aclose()


async def get_user_media(limit: int = 25, *, access_token: str, client=None) -> list[dict]:
    data = await _request(client, "GET",
                          f"{GRAPH_BASE}/me/media?fields=id,caption,media_type,timestamp,permalink"
                          f"&limit={limit}&access_token={access_token}")
    return data.get("data", [])


async def refresh_long_lived_token(long_lived_token: str, *, client=None) -> dict:
    data = await _request(client, "GET",
                          f"{GRAPH_BASE}/refresh_access_token?grant_type=ig_refresh_token"
                          f"&access_token={long_lived_token}")
    return {"access_token": data["access_token"], "expires_in": data.get("expires_in", 5184000)}


async def subscribe_to_webhooks(ig_account_id: str, *, access_token: str,
                                subscribed_fields: list[str], client=None) -> dict:
    # Meta documents this as a form/query POST; a JSON array body can silently fail.
    return await _request(client, "POST",
                          f"{GRAPH_BASE}/{ig_account_id}/subscribed_apps",
                          params={"subscribed_fields": ",".join(subscribed_fields),
                                  "access_token": access_token})
