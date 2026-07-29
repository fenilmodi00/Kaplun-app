# Comment Automation Engine Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Port openreply's Instagram comment-automation engine (keyword → auto DM + optional public reply) into our FastAPI backend and Expo app, with a dedicated "Automate" tab, over 3 phases (~2.5 weeks).

**Architecture:** Meta webhooks → FastAPI `POST /webhooks/instagram` (HMAC-verified) → durable Appwrite job rows → BackgroundTasks + 60s sweeper → worker ports openreply's pipeline (match → dedup → rate-limit → public reply → DM → log). Official Graph API v25.0 only (instagrapi untouched for read-only features). The app calls FastAPI for all automation data; automation tables are server-owned. Design doc: `docs/plans/2026-07-29-comment-automation-design.md`.

**Tech Stack:** FastAPI + httpx (async) + Appwrite TablesDB (server SDK) + cryptography (AES-256-GCM) + pytest · Expo SDK 54 + @tanstack/react-query v5 + jest-expo · openreply source: MIT (attribution headers required in every ported file).

## Key facts (verified — read before starting)

- Backend lives INSIDE this repo at `api/` (the `D:\001\api` path in old docs is stale).
- `api/auth.py` exposes `get_clerk_user_id(authorization)`; `api/main.py` wraps it as `require_clerk_user_id` (Header dep) and includes routers via `app.include_router(...)` — follow that pattern. New routers must NOT import from `api.main` (circular); depend on `api.auth.get_clerk_user_id` or replicate the small Header wrapper in the router file.
- `api/appwrite_client.py` is creators-specific — do NOT extend it. New data access goes in `api/automation_store.py` (same client construction + env vars).
- OAuth long-lived tokens are already stored in `creators.access_token` (plaintext today — Task 4 encrypts new writes; `decrypt_or_plaintext` covers legacy rows).
- `api/main.py` imports `RateLimitError` from `instagrapi.exceptions`; our graph client defines its own. The plan names ours `GraphRateLimitError` to avoid confusion.
- `requirements.txt` lacks `pytest`, `pytest-asyncio`, `cryptography` — Task 1 adds them. No `api/tests/` exists yet — Task 1 creates it.
- App: `@tanstack/react-query` v5 present. Hook pattern: `src/hooks/useMessages.ts`. FastAPI client pattern: `src/lib/instagram.ts` (`getAuthHeaders`, `fetchWithTimeout`, 401→`'session_expired'`); session recovery wrapper: `src/lib/with-fresh-session.ts`.
- Backend tests run from repo root: `python -m pytest api/tests/<file> -v`. App tests: `bun test src/__tests__/<file>`. Lint: `bun run lint` (tsc --noEmit).
- Appwrite Python SDK: `TablesDB` from `appwrite.services.tables_db`, rows API (`create_row`/`list_rows`/`get_row`/`update_row`/`delete_row`), `Query` from `appwrite.query`, `ID.unique()` from `appwrite.id`.

---

## Task 1: Backend test scaffolding + dependencies

**Files:**
- Modify: `api/requirements.txt`
- Create: `api/tests/__init__.py` (empty)
- Create: `api/tests/conftest.py`
- Create: `pytest.ini` (repo root)

**Step 1: Add deps**

Append to `api/requirements.txt`:
```
pytest>=8.0
pytest-asyncio>=0.24
cryptography>=42.0
```
Run: `pip install pytest pytest-asyncio cryptography`

**Step 2: conftest + pytest.ini**

```python
# api/tests/conftest.py
import base64
import os
import sys
from pathlib import Path

# Repo root on sys.path so `import api.xxx` works when pytest runs from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

# Env defaults BEFORE any api module import (modules read env at import time).
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"k" * 32).decode())
os.environ.setdefault("WEBHOOK_VERIFY_TOKEN", "test-verify-token")
os.environ.setdefault("INSTAGRAM_APP_SECRET", "test-ig-secret")
os.environ.setdefault("CRON_SECRET", "test-cron-secret")
os.environ.setdefault("PUBLIC_BASE_URL", "https://api.example.com")
```

```ini
# pytest.ini
[pytest]
asyncio_mode = auto
```

**Step 3: Verify** — `python -m pytest api/tests/ -v` → "no tests ran" (exit 5) = scaffolding works.

**Step 4: Commit**
```bash
git add api/requirements.txt api/tests/ pytest.ini
git commit -m "test: pytest scaffolding + cryptography dep for automation engine"
```

---

## Task 2: Appwrite tables + env vars (manual console step)

**No code — checklist.** Appwrite Console → Databases → `vernacular_saas` → create 6 tables. Document `$id` is the primary key everywhere (no custom id attributes).

**`automations`** attributes:
- `clerk_user_id` string(128) req · `ig_user_id` string(64) req · `name` string(128) req
- `target_type` string(32) req (`all_posts`|`specific_posts`|`next_reel`)
- `media_ids` string(64) array · `bound_media_ids` string(64) array
- `keywords` string(128) array req · `match_mode` string(16) req default `whole_word`
- `opening_dm_mode` string(16) req default `direct` · `dm_message` string(2000) req
- `button_text` string(64) opt · `reveal_message` string(2000) opt
- `track_links` bool default false · `public_reply_enabled` bool default false · `public_reply_message` string(2000) opt
- `status` string(16) req default `active` · `created_at` datetime req · `updated_at` datetime req
- Indexes: `clerk_user_id` asc · (`ig_user_id`, `status`) asc

**`automation_logs`**:
- `automation_id` string(64) req · `clerk_user_id` string(128) req · `ig_user_id` string(64) req
- `media_id` string(64) opt · `comment_id` string(128) req · `commenter_username` string(128) opt
- `comment_text` string(1000) opt · `matched_keyword` string(128) opt
- `action` string(32) req (`pending`|`dm_sent`|`button_dm_sent`|`reveal_sent`|`reply_sent`|`skipped`|`failed`)
- `reason` string(500) opt · `created_at` datetime req
- Indexes: (`automation_id`, `comment_id`) · (`automation_id`, `created_at` desc) · (`ig_user_id`, `created_at`)

**`automation_jobs`**:
- `type` string(32) req · `payload` string(4000) req · `status` string(16) req default `pending`
- `attempts` integer req default 0 · `run_at` datetime req · `created_at` datetime req
- Index: (`status`, `run_at`)

**`tracked_links`**: `automation_id` string(64) req · `target_url` string(2000) req · `created_at` datetime req — row `$id` IS the slug (create with custom ID).

**`link_clicks`**: `slug` string(64) req (index) · `clicked_at` datetime req.

**`webhook_events`**: `payload` string(16000) req · `received_at` datetime req.

Record table IDs in `api/.env` + `api/.env.example`:
```
APPWRITE_AUTOMATIONS_TABLE_ID=...
APPWRITE_AUTOMATION_LOGS_TABLE_ID=...
APPWRITE_AUTOMATION_JOBS_TABLE_ID=...
APPWRITE_TRACKED_LINKS_TABLE_ID=...
APPWRITE_LINK_CLICKS_TABLE_ID=...
APPWRITE_WEBHOOK_EVENTS_TABLE_ID=...
WEBHOOK_VERIFY_TOKEN=<random-string>
TOKEN_ENCRYPTION_KEY=<python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())">
CRON_SECRET=<random-string>
PUBLIC_BASE_URL=https://<deployed-api-host>
```

**Commit:** `git add api/.env.example && git commit -m "chore: automation table env vars"`

---

# PHASE 1 — CORE LOOP

## Task 3: `api/keyword_matcher.py` (port of `lib/utils/keyword-matcher.ts`)

**Files:**
- Create: `api/keyword_matcher.py`
- Test: `api/tests/test_keyword_matcher.py`

**Step 1: Write the failing test**

```python
from api.keyword_matcher import match_keywords, strip_special_characters


def test_strip_emojis_and_punct():
    assert strip_special_characters("LINK!!! \U0001F525\U0001F525") == "LINK"
    assert strip_special_characters("  send   me   the  link ") == "send me the link"


def test_whole_word_match_case_insensitive():
    r = match_keywords("Please send the LINK now", ["link"], True)
    assert r.matched and r.matched_keyword == "link"


def test_whole_word_rejects_substring():
    assert not match_keywords("I am linking this", ["link"], True).matched


def test_partial_match_allows_substring():
    assert match_keywords("I am linking this", ["link"], False).matched


def test_multi_keyword_or_logic():
    r = match_keywords("send SHOP details", ["link", "shop"], True)
    assert r.matched and r.matched_keyword == "shop"


def test_empty_inputs_no_match():
    assert not match_keywords("", ["link"], True).matched
    assert not match_keywords("hello", [], True).matched


def test_keyword_with_emoji_stripped():
    r = match_keywords("price please", ["price \U0001F4B0"], True)
    assert r.matched and r.matched_keyword == "price \U0001F4B0"
```

**Step 2: Run to verify it fails**

Run: `python -m pytest api/tests/test_keyword_matcher.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'api.keyword_matcher'`

**Step 3: Implement**

```python
# api/keyword_matcher.py
"""Keyword matcher — Python port of openreply's lib/utils/keyword-matcher.ts.

Ported from https://github.com/diwenne/openreply (MIT License,
Copyright (c) 2026 Anish Raj, Diwen Huang).

NOTE: JavaScript \\w is ASCII-only, so this port uses an explicit ASCII
non-word class ([^A-Za-z0-9_\\s]) — Python's \\w is Unicode-aware and would
keep accented letters the original strips.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_EMOJI_RE = re.compile(
    "[" + "".join(
        f"{chr(lo)}-{chr(hi)}"
        for lo, hi in [
            (0x1F600, 0x1F64F), (0x1F300, 0x1F5FF), (0x1F680, 0x1F6FF),
            (0x1F1E0, 0x1F1FF), (0x2600, 0x26FF), (0x2700, 0x27BF),
            (0xFE00, 0xFE0F), (0x1F900, 0x1F9FF), (0x1FA00, 0x1FA6F),
            (0x1FA70, 0x1FAFF),
        ]
    ) + chr(0x200D) + chr(0x20E3) + "]"
)
_NON_WORD_RE = re.compile(r"[^A-Za-z0-9_\s]")
_WS_RE = re.compile(r"\s+")


@dataclass(frozen=True)
class KeywordMatchResult:
    matched: bool
    matched_keyword: str | None


def strip_special_characters(text: str) -> str:
    text = _EMOJI_RE.sub("", text)
    text = _NON_WORD_RE.sub(" ", text)
    return _WS_RE.sub(" ", text).strip()


def match_keywords(
    comment_text: str, keywords: list[str], whole_word_match: bool = True
) -> KeywordMatchResult:
    if not comment_text or not keywords:
        return KeywordMatchResult(False, None)

    cleaned_text = strip_special_characters(comment_text).lower()
    if not cleaned_text:
        return KeywordMatchResult(False, None)

    for keyword in keywords:
        cleaned_keyword = strip_special_characters(keyword).lower()
        if not cleaned_keyword:
            continue
        if whole_word_match:
            if re.search(rf"\b{re.escape(cleaned_keyword)}\b", cleaned_text, re.IGNORECASE):
                return KeywordMatchResult(True, keyword)
        elif cleaned_keyword in cleaned_text:
            return KeywordMatchResult(True, keyword)

    return KeywordMatchResult(False, None)
```

**Step 4: Run to verify pass** — `python -m pytest api/tests/test_keyword_matcher.py -v` → 7 passed.

**Step 5: Commit** — `git add api/keyword_matcher.py api/tests/test_keyword_matcher.py && git commit -m "feat: port keyword matcher from openreply (MIT)"`

---

## Task 4: `api/token_crypto.py` + encrypt at OAuth callback

**Files:**
- Create: `api/token_crypto.py`
- Test: `api/tests/test_token_crypto.py`
- Modify: `api/routes/instagram_oauth.py` (callback store step, ~L465)

**Step 1: Write the failing test**

```python
import os
from api.token_crypto import TokenCrypto, decrypt_or_plaintext


def test_roundtrip():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    enc = c.encrypt("IGQVJ-example-token")
    assert enc != "IGQVJ-example-token"
    assert c.decrypt(enc) == "IGQVJ-example-token"


def test_random_nonce_different_ciphertexts():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    assert c.encrypt("same") != c.encrypt("same")


def test_decrypt_or_plaintext_migration_fallback():
    c = TokenCrypto(os.environ["TOKEN_ENCRYPTION_KEY"])
    assert decrypt_or_plaintext("legacy-plaintext-token", c) == "legacy-plaintext-token"
    assert decrypt_or_plaintext(c.encrypt("new-token"), c) == "new-token"
```

**Step 2: Run → FAIL (module missing).**

**Step 3: Implement**

```python
# api/token_crypto.py
"""AES-256-GCM token encryption at rest — port of openreply's
lib/meta/oauth.ts encryptToken/decryptToken (MIT License,
Copyright (c) 2026 Anish Raj, Diwen Huang).

Format: base64url(nonce[12] || ciphertext || tag). Key: 32-byte base64url
in TOKEN_ENCRYPTION_KEY. Generate:
  python -c "import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())"
"""
from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class TokenCrypto:
    def __init__(self, key_b64: str):
        self._aesgcm = AESGCM(base64.urlsafe_b64decode(key_b64.encode()))

    def encrypt(self, plaintext: str) -> str:
        nonce = os.urandom(12)
        ct = self._aesgcm.encrypt(nonce, plaintext.encode(), None)
        return base64.urlsafe_b64encode(nonce + ct).decode()

    def decrypt(self, stored: str) -> str:
        raw = base64.urlsafe_b64decode(stored.encode())
        return self._aesgcm.decrypt(raw[:12], raw[12:], None).decode()


def get_token_crypto() -> TokenCrypto:
    key = os.getenv("TOKEN_ENCRYPTION_KEY", "")
    if not key:
        raise RuntimeError("TOKEN_ENCRYPTION_KEY env var is not set")
    return TokenCrypto(key)


def decrypt_or_plaintext(stored: str, crypto: TokenCrypto) -> str:
    """Migration helper: legacy rows hold plaintext tokens."""
    try:
        return crypto.decrypt(stored)
    except Exception:
        return stored
```

**Step 4: Run → 3 passed.**

**Step 5: Encrypt in the OAuth callback** — in `api/routes/instagram_oauth.py`, step 8 of `instagram_callback` (before `build_creator_data(...)`):

```python
from api.token_crypto import get_token_crypto
# ...inside the existing try block:
encrypted_token = get_token_crypto().encrypt(long_token)
creator_data = build_creator_data(profile, encrypted_token, token_expires_at, clerk_id)
```

**Step 6: Verify** — `python -m pytest api/tests/ -v` green + `python -c "import api.main"` no import errors.

**Step 7: Commit** — `git add api/token_crypto.py api/tests/test_token_crypto.py api/routes/instagram_oauth.py && git commit -m "feat: AES-256-GCM token encryption at rest (port from openreply)"`

---

## Task 5: `api/graph_client.py` (port of `lib/meta/client.ts`)

**Files:**
- Create: `api/graph_client.py`
- Test: `api/tests/test_graph_client.py`

**Step 1: Write the failing test** (`httpx.MockTransport` — no network):

```python
import json
import httpx

from api.graph_client import (
    TokenExpiredError,
    send_private_reply,
    send_comment_reply,
    refresh_long_lived_token,
)


def _client(handler):
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


async def test_send_private_reply_shape():
    seen = {}

    async def handler(request):
        seen["url"] = str(request.url)
        seen["body"] = json.loads(request.content)
        seen["auth"] = request.headers["authorization"]
        return httpx.Response(200, json={"recipient_id": "r1", "message_id": "m1"})

    async with _client(handler) as c:
        out = await send_private_reply("ig123", "cmt9", "hi there", access_token="tok", client=c)

    assert out["message_id"] == "m1"
    assert seen["url"] == "https://graph.instagram.com/v25.0/ig123/messages"
    assert seen["body"] == {"recipient": {"comment_id": "cmt9"}, "message": {"text": "hi there"}}
    assert seen["auth"] == "Bearer tok"


async def test_send_comment_reply_shape():
    async def handler(request):
        assert str(request.url) == "https://graph.instagram.com/v25.0/cmt9/replies"
        assert json.loads(request.content) == {"message": "thanks!"}
        return httpx.Response(200, json={"id": "reply1"})

    async with _client(handler) as c:
        assert (await send_comment_reply("cmt9", "thanks!", access_token="t", client=c))["id"] == "reply1"


async def test_error_190_raises_token_expired():
    async def handler(request):
        return httpx.Response(400, json={"error": {"message": "expired", "type": "OAuthException", "code": 190, "fbtrace_id": "fb"}})

    async with _client(handler) as c:
        try:
            await send_private_reply("ig", "c", "m", access_token="t", client=c)
            assert False, "should have raised"
        except TokenExpiredError:
            pass


async def test_refresh_token():
    async def handler(request):
        assert "grant_type=ig_refresh_token" in str(request.url)
        return httpx.Response(200, json={"access_token": "newtok", "expires_in": 5184000})

    async with _client(handler) as c:
        out = await refresh_long_lived_token("oldtok", client=c)
    assert out["access_token"] == "newtok" and out["expires_in"] == 5184000
```

(Tests are plain `async def` — `pytest.ini`'s `asyncio_mode = auto` handles them.)

**Step 2: Run → FAIL (module missing).**

**Step 3: Implement**

```python
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
        if code in (368, 4, 17):
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
    return await _request(client, "POST", f"{GRAPH_BASE}/{ig_account_id}/subscribed_apps",
                          headers=_auth(access_token),
                          json={"subscribed_fields": subscribed_fields})
```

**Step 4: Run → 4 passed.**

**Step 5: Commit** — `git add api/graph_client.py api/tests/test_graph_client.py && git commit -m "feat: async Meta Graph API client (port from openreply)"`

---

## Task 6: Subscribe account to webhooks at OAuth callback

**Files:**
- Modify: `api/routes/instagram_oauth.py` (`instagram_callback`, after the store-success block, before `return HTMLResponse(content=success_page(...))`)

**Step 1: Implement**

```python
    # ── Step 8.5: Subscribe the account to comment/message webhooks ──────
    # Failure must NOT fail the OAuth flow — the cron reconciler (Task 25)
    # still catches comments, and re-subscribe can be retried.
    try:
        from api.graph_client import subscribe_to_webhooks
        await subscribe_to_webhooks(
            ig_account_id=profile.get("id", ""),
            access_token=long_token,
            subscribed_fields=["comments", "messages"],
        )
        logger.info("[OAUTH] Webhook subscription ok for @{}", username)
    except Exception as exc:
        logger.error("[OAUTH] Webhook subscription failed for @{}: {}", username, exc)
```

**Step 2: Verify** — `python -m pytest api/tests/ -v` green + `python -c "import api.main"` clean.

**Step 3: Commit** — `git add api/routes/instagram_oauth.py && git commit -m "feat: subscribe IG account to webhooks on OAuth connect"`

---

## Task 7: `api/webhook_security.py` (port of `lib/meta/webhook.ts`)

**Files:**
- Create: `api/webhook_security.py`
- Test: `api/tests/test_webhook_security.py`

**Step 1: Write the failing test**

```python
import hashlib
import hmac

from api.webhook_security import verify_signature, parse_comment_events, parse_postback_events

SECRET = "test-ig-secret"


def _sig(body: bytes) -> str:
    return "sha256=" + hmac.new(SECRET.encode(), body, hashlib.sha256).hexdigest()


def test_verify_signature_ok_and_bad():
    body = b'{"object":"instagram","entry":[]}'
    assert verify_signature(body, _sig(body), [SECRET])
    assert not verify_signature(body, "sha256=deadbeef", [SECRET])
    assert not verify_signature(body, None, [SECRET])
    assert not verify_signature(body, _sig(body), [])


def test_parse_comment_events_basic_and_self_skip():
    payload = {"object": "instagram", "entry": [
        {"id": "ig1", "time": 1, "changes": [
            {"field": "comments", "value": {"id": "c1", "text": "LINK please",
                                            "from": {"id": "u2", "username": "fan"},
                                            "media": {"id": "m1"}}},
            {"field": "comments", "value": {"id": "c2", "text": "own",
                                            "from": {"id": "ig1"}, "media": {"id": "m1"}}},
            {"field": "likes", "value": {}},
        ]}]}
    events = parse_comment_events(payload)
    assert len(events) == 1
    e = events[0]
    assert (e.instagram_account_id, e.comment_id, e.media_id, e.commenter_id) == ("ig1", "c1", "m1", "u2")
    assert e.comment_text == "LINK please" and e.commenter_name == "fan"


def test_parse_comment_events_non_instagram_object():
    assert parse_comment_events({"object": "page", "entry": []}) == []


def test_parse_postback_events():
    payload = {"object": "instagram", "entry": [
        {"id": "ig1", "messaging": [
            {"sender": {"id": "u2"}, "recipient": {"id": "ig1"},
             "postback": {"mid": "m1", "title": "Get it", "payload": "reveal:auto1"}}]}]}
    events = parse_postback_events(payload)
    assert len(events) == 1 and events[0].payload == "reveal:auto1" and events[0].user_id == "u2"
```

**Step 2: Run → FAIL.**

**Step 3: Implement** — faithful port:

```python
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
```

**Step 4: Run → 4 passed.**
**Step 5: Commit** — `git add api/webhook_security.py api/tests/test_webhook_security.py && git commit -m "feat: webhook signature verify + event parsers (port)"`

---

## Task 8: `api/automation_store.py` (Appwrite data access)

**Files:**
- Create: `api/automation_store.py`
- Test: `api/tests/test_automation_store.py`

**Step 1: Implement** — singleton wrapping `TablesDB`. Mirror `api/appwrite_client.py`'s client construction (same `APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` / `APPWRITE_API_KEY` / `APPWRITE_DATABASE_ID` env vars); table IDs from Task 2 env. Bodies are thin `create_row`/`list_rows`/`get_row`/`update_row`/`delete_row` calls with `appwrite.query.Query`:

```python
class AutomationStore:
    # automations
    def create_automation(self, data: dict) -> dict                       # ID.unique()
    def list_automations(self, clerk_user_id: str) -> list[dict]          # equal clerk_user_id, order_desc created_at
    def get_automation(self, automation_id: str) -> dict | None           # None on 404
    def update_automation(self, automation_id: str, data: dict) -> dict
    def delete_automation(self, automation_id: str) -> None
    def list_active_for_ig(self, ig_user_id: str) -> list[dict]           # equal ig_user_id + equal status "active"
    # logs
    def create_log(self, data: dict) -> dict
    def find_log(self, automation_id: str, comment_id: str) -> dict | None  # equal both, limit 1
    def update_log(self, log_id: str, data: dict) -> dict
    def list_logs(self, automation_id: str, limit: int = 100) -> list[dict]  # order_desc created_at
    def list_recent_logs_for_user(self, clerk_user_id: str, limit: int = 20) -> list[dict]
    def count_recent_dm_actions(self, ig_user_id: str, since_iso: str) -> int
        # equal ig_user_id, greater_than created_at since_iso,
        # equal action ["pending", "dm_sent", "button_dm_sent"]  -> read response.total
    # jobs
    def create_job(self, type_: str, payload: dict, run_at_iso: str | None = None) -> dict
        # payload=json.dumps(payload); run_at defaults to now
    def get_job(self, job_id: str) -> dict | None
    def update_job(self, job_id: str, data: dict) -> dict
    def list_due_jobs(self, now_iso: str, limit: int = 25) -> list[dict]
        # equal status "pending", less_than_equal run_at now_iso, order_asc run_at
    # creators (read-only, for token lookup)
    def get_creator_by_clerk_id(self, clerk_user_id: str) -> dict | None  # creators table, equal clerk_user_id, limit 1


def get_automation_store() -> AutomationStore:  # module-level singleton
    ...
```

(Appwrite datetime filters accept ISO-8601 strings. If the installed SDK's `Query` lacks `less_than_equal`, use `Query.less_than("run_at", now_iso)` — reconciliation tolerance is fine.)

**Step 2: Tests** — construct `AutomationStore` with a `FakeTables` injected (constructor takes optional `tables` param for testability):
- `find_log` returns None when `list_rows` returns `{"rows": [], "total": 0}`, row dict otherwise
- `count_recent_dm_actions` returns `.total` from the fake
- `list_active_for_ig` issues exactly 2 equal-filters (ig_user_id, status)
- `create_job` json-serializes payload and defaults `run_at`

**Step 3: Run → pass.**
**Step 4: Commit** — `git add api/automation_store.py api/tests/test_automation_store.py && git commit -m "feat: automation Appwrite store layer"`

---

## Task 9: `api/rate_limiter.py`

**Files:**
- Create: `api/rate_limiter.py`
- Test: `api/tests/test_rate_limiter.py`

**Step 1: Write the failing test**

```python
from api.rate_limiter import check_dm_rate, RATE_LIMIT_MAX


class FakeStore:
    def __init__(self, n):
        self.n = n

    def count_recent_dm_actions(self, ig, since):
        return self.n


def test_allowed_under_cap():
    d = check_dm_rate(FakeStore(10), "ig1", requeue_attempt=0)
    assert d.allowed and d.current_count == 10


def test_at_cap_requeues_first_times():
    d = check_dm_rate(FakeStore(RATE_LIMIT_MAX), "ig1", requeue_attempt=1)
    assert not d.allowed and d.should_requeue and d.requeue_delay_minutes == 30 and not d.should_skip


def test_at_cap_skips_after_max_attempts():
    d = check_dm_rate(FakeStore(RATE_LIMIT_MAX), "ig1", requeue_attempt=3)
    assert not d.allowed and d.should_skip and not d.should_requeue
```

**Step 2: Run → FAIL.**

**Step 3: Implement**

```python
# api/rate_limiter.py
"""750 DMs/hour/account (Meta Private Replies cap) — logic port of openreply's
lib/utils/rate-limiter.ts (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang).

Their atomic Redis Lua counter becomes: count of automation_logs rows with
action in (pending, dm_sent, button_dm_sent) in the rolling hour. The worker's
'pending' log row IS the reservation (created before send)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

RATE_LIMIT_MAX = 750
REQUEUE_DELAY_MINUTES = 30
MAX_REQUEUE_ATTEMPTS = 3


@dataclass(frozen=True)
class RateDecision:
    allowed: bool
    current_count: int
    should_requeue: bool
    should_skip: bool
    requeue_delay_minutes: int


def check_dm_rate(store, ig_user_id: str, requeue_attempt: int = 0) -> RateDecision:
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    count = store.count_recent_dm_actions(ig_user_id, since)
    if count < RATE_LIMIT_MAX:
        return RateDecision(True, count, False, False, 0)
    if requeue_attempt >= MAX_REQUEUE_ATTEMPTS:
        return RateDecision(False, count, False, True, 0)
    return RateDecision(False, count, True, False, REQUEUE_DELAY_MINUTES)
```

**Step 4: Run → 3 passed.**
**Step 5: Commit** — `git add api/rate_limiter.py api/tests/test_rate_limiter.py && git commit -m "feat: DM rate limiter (750/hr Meta cap, port)"`

---

## Task 10: `api/automation_worker.py` (port of `processComment` from `lib/queue/dm-worker.ts`)

**Files:**
- Create: `api/automation_worker.py`
- Test: `api/tests/test_automation_worker.py`

**Step 1: Write the failing tests** — fake store (in-memory dicts) + monkeypatched `graph_client` async stubs. Cases:
1. **No keyword match** → no log created, no sends.
2. **Match** → pending log created → public reply called first → DM sent → log updated to `dm_sent`.
3. **Dedup** — existing `dm_sent` log for (automation, comment) → zero sends, zero new logs.
4. **Rate limited** (store count = 750) → `process_comment_event` returns `"requeue"`; `run_job` sets job `status=pending`, `run_at` ≈ +30min, payload `requeue_attempt` incremented.
5. **TokenExpiredError** from DM send → automation `status="error"`, log `failed/token_expired`, no exception propagates.
6. **Generic MetaApiError** → `run_job` increments attempts with backoff `[5,15,45]` min; after 3rd attempt job `status=failed`.

**Step 2: Run → FAIL (module missing).**

**Step 3: Implement** — the pipeline order below is the port's fidelity contract (mirrors openreply's `processComment` step-for-step):

```python
# api/automation_worker.py
"""Comment automation worker — port of openreply's lib/queue/dm-worker.ts
processComment (MIT License, Copyright (c) 2026 Anish Raj, Diwen Huang).

Pipeline: load automations → keyword match → dedup → decrypt token →
rate check → pending log (slot reservation) → public reply FIRST → DM → log.
BullMQ retry is replaced by job-row attempts with backoff [5, 15, 45] min.
"""
from __future__ import annotations

import asyncio
import json
import re
from datetime import datetime, timedelta, timezone

from loguru import logger

from api import graph_client
from api.graph_client import GraphRateLimitError, MetaApiError, TokenExpiredError
from api.keyword_matcher import match_keywords
from api.rate_limiter import check_dm_rate
from api.token_crypto import decrypt_or_plaintext, get_token_crypto

BACKOFF_MINUTES = [5, 15, 45]
MAX_ATTEMPTS = 3


def _now() -> datetime:
    return datetime.now(timezone.utc)


def personalize(text: str, commenter_name: str | None) -> str:
    """{username} -> commenter name (or 'there') — port of renderMessage* personalization."""
    return re.sub(r"\{username\}", commenter_name or "there", text or "", flags=re.IGNORECASE)


async def process_comment_event(store, event: dict, requeue_attempt: int = 0) -> str:
    """Process one comment across all matching automations.

    Returns 'done' or 'requeue'. Raises MetaApiError for job-level retry.
    """
    ig_id = event["instagram_account_id"]
    automations = [
        a for a in store.list_active_for_ig(ig_id)
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

        # STEP 3: dedup
        existing = store.find_log(auto["$id"], event["comment_id"])
        if existing and existing.get("action") in ("pending", "dm_sent", "button_dm_sent", "skipped"):
            continue

        # STEP 4: token
        creator = store.get_creator_by_clerk_id(auto["clerk_user_id"])
        if not creator or not creator.get("access_token"):
            _fail_log(store, existing, auto, event, "no_access_token")
            continue
        try:
            token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
        except Exception:
            _fail_log(store, existing, auto, event, "token_decrypt_failed")
            continue

        # STEP 5: rate check (before creating the reservation row)
        rate = check_dm_rate(store, ig_id, requeue_attempt)
        if not rate.allowed:
            if rate.should_skip:
                _fail_log(store, existing, auto, event, "skipped_rate_limit")
                continue
            return "requeue"

        # STEP 6: pending log = rate slot reservation + dedup anchor
        log = existing or store.create_log({
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

            # STEP 8: DM — direct mode in Phase 1; button mode lands in Task 20
            await graph_client.send_private_reply(
                ig_id,
                event["comment_id"],
                personalize(auto["dm_message"], event.get("commenter_name")),
                access_token=token,
            )
            store.update_log(log["$id"], {"action": "dm_sent", "reason": None})

        except TokenExpiredError:
            store.update_automation(auto["$id"], {"status": "error", "updated_at": _now().isoformat()})
            store.update_log(log["$id"], {"action": "failed", "reason": "token_expired"})
        except GraphRateLimitError:
            return "requeue"

    return "done"


def _fail_log(store, existing, auto, event, reason: str) -> None:
    action = "skipped" if reason.startswith("skipped") else "failed"
    if existing:
        store.update_log(existing["$id"], {"action": action, "reason": reason})
    else:
        store.create_log({
            "automation_id": auto["$id"],
            "clerk_user_id": auto["clerk_user_id"],
            "ig_user_id": event["instagram_account_id"],
            "media_id": event["media_id"],
            "comment_id": event["comment_id"],
            "action": action,
            "reason": reason,
            "created_at": _now().isoformat(),
        })


async def run_job(store, job_id: str) -> None:
    job = store.get_job(job_id)
    if not job or job.get("status") == "done":
        return
    store.update_job(job_id, {"status": "processing"})
    try:
        payload = json.loads(job["payload"])
        result = await process_comment_event(store, payload, payload.get("requeue_attempt", 0))
        if result == "requeue":
            payload["requeue_attempt"] = payload.get("requeue_attempt", 0) + 1
            store.update_job(job_id, {
                "status": "pending",
                "payload": json.dumps(payload),
                "run_at": (_now() + timedelta(minutes=30)).isoformat(),
            })
        else:
            store.update_job(job_id, {"status": "done"})
    except MetaApiError as exc:
        attempts = int(job.get("attempts", 0)) + 1
        if attempts >= MAX_ATTEMPTS:
            store.update_job(job_id, {"status": "failed", "attempts": attempts})
            logger.error("job {} dead-lettered after {} attempts: {}", job_id, attempts, exc)
        else:
            store.update_job(job_id, {
                "status": "pending",
                "attempts": attempts,
                "run_at": (_now() + timedelta(minutes=BACKOFF_MINUTES[attempts - 1])).isoformat(),
            })
    except Exception:
        store.update_job(job_id, {"status": "failed", "attempts": int(job.get("attempts", 0)) + 1})
        logger.exception("job {} failed unexpectedly", job_id)


async def run_job_safe(store, job_id: str) -> None:
    """BackgroundTasks entrypoint — must never raise."""
    try:
        await run_job(store, job_id)
    except Exception:
        logger.exception("run_job_safe swallowed error for job {}", job_id)


async def sweeper_loop(store, interval_seconds: int = 60) -> None:
    """Lifespan task: pick up due pending jobs (crash recovery + requeues)."""
    while True:
        try:
            for job in store.list_due_jobs(_now().isoformat()):
                await run_job_safe(store, job["$id"])
        except Exception:
            logger.exception("sweeper iteration failed")
        await asyncio.sleep(interval_seconds)
```

**Step 4: Run → 6 tests pass.**
**Step 5: Commit** — `git add api/automation_worker.py api/tests/test_automation_worker.py && git commit -m "feat: automation worker pipeline (port of dm-worker)"`

---

## Task 11: `api/routes/webhooks.py` + main.py wiring

**Files:**
- Create: `api/routes/webhooks.py`
- Modify: `api/main.py` (include router; start sweeper in lifespan)
- Test: `api/tests/test_webhooks_route.py`

**Step 1: Write the failing test** (TestClient + monkeypatched store):

```python
import hashlib
import hmac
import json

from fastapi.testclient import TestClient

from api.main import app


def test_get_verification_ok():
    r = TestClient(app).get("/webhooks/instagram", params={
        "hub.mode": "subscribe", "hub.verify_token": "test-verify-token", "hub.challenge": "42"})
    assert r.status_code == 200 and r.text == "42"


def test_get_verification_wrong_token_403():
    r = TestClient(app).get("/webhooks/instagram", params={
        "hub.mode": "subscribe", "hub.verify_token": "wrong", "hub.challenge": "42"})
    assert r.status_code == 403


def test_post_bad_signature_401():
    r = TestClient(app).post("/webhooks/instagram", content=b"{}",
                             headers={"x-hub-signature-256": "sha256=bad"})
    assert r.status_code == 401


def test_post_creates_job(monkeypatch):
    created = []

    class FakeStore:
        def create_job(self, type_, payload, run_at_iso=None):
            created.append((type_, payload))
            return {"$id": "j1"}

    monkeypatch.setattr("api.routes.webhooks.get_automation_store", lambda: FakeStore())
    body = json.dumps({"object": "instagram", "entry": [{"id": "ig1", "changes": [
        {"field": "comments", "value": {"id": "c1", "text": "LINK",
                                        "from": {"id": "u2"}, "media": {"id": "m1"}}}]}]}).encode()
    sig = "sha256=" + hmac.new(b"test-ig-secret", body, hashlib.sha256).hexdigest()
    r = TestClient(app).post("/webhooks/instagram", content=body,
                             headers={"x-hub-signature-256": sig})
    assert r.status_code == 200
    assert created and created[0][0] == "process_comment"
    assert created[0][1]["comment_id"] == "c1"
```

**Step 2: Run → FAIL (404).**

**Step 3: Implement the route**

```python
# api/routes/webhooks.py
"""Meta webhook receiver. GET = verification handshake; POST = HMAC-verified
event intake -> durable job rows -> BackgroundTasks processing. Always 200
after a valid signature (Meta retries non-200s). Raw payload logging lands
in Task 27."""
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

    payload = json.loads(raw.decode() or "{}")
    store = get_automation_store()

    for event in parse_comment_events(payload):
        job = store.create_job("process_comment", asdict(event))
        background_tasks.add_task(run_job_safe, store, job["$id"])
        logger.info("queued process_comment job {} for comment {}", job["$id"], event.comment_id)

    # Phase 2 (Task 20): postback events get parsed here and queued as
    # "send_reveal" jobs. parse_postback_events is already imported/ready.
    if parse_postback_events(payload):
        logger.info("postback events received (handler lands in Task 20)")

    return {"status": "ok"}
```

**Step 4: Wire into `api/main.py`**

```python
from api.routes.webhooks import router as webhooks_router
from api.automation_store import get_automation_store
from api.automation_worker import sweeper_loop

app.include_router(instagram_oauth_router)   # existing line
app.include_router(webhooks_router)          # add right after

# lifespan — start the sweeper alongside the existing startup:
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("API server starting up")
    sweeper = asyncio.create_task(sweeper_loop(get_automation_store()))
    yield
    sweeper.cancel()
    sm = get_session_manager()
    logged_out = sm.logout_all()
    logger.info("API server shutting down (logged out {} sessions)", logged_out)
```
(Add `import asyncio` to main.py's imports.)

**Step 5: Run → 4 passed.**
**Step 6: Commit** — `git add api/routes/webhooks.py api/main.py api/tests/test_webhooks_route.py && git commit -m "feat: Meta webhook receiver + job sweeper lifespan"`

---

## Task 12: `api/routes/automations.py` (CRUD + logs)

**Files:**
- Create: `api/routes/automations.py`
- Modify: `api/main.py` (include router)
- Test: `api/tests/test_automations_route.py`

**Step 1: Write the failing tests** (TestClient; monkeypatch `get_automation_store` in the route module + monkeypatch auth dep to return a fixed clerk id):
1. `POST /automations` with empty keywords → 422; empty `dm_message` → 422; `target_type="specific_posts"` with empty `media_ids` → 422.
2. Valid create → 200, store received `clerk_user_id` from auth + `status="active"` + timestamps.
3. `GET /automations` → returns only that clerk's rows (store called with clerk id).
4. `PATCH /automations/{id}` on someone else's row (store row has different `clerk_user_id`) → 404 (not 403 — don't leak existence).
5. `GET /automations/{id}/logs` → passes through store list.
6. Unauthenticated (no Authorization header) → 401.

Auth override pattern for tests:
```python
from api.main import app
from api.auth import get_clerk_user_id
app.dependency_overrides[get_clerk_user_id] = lambda: "clerk_test_1"
```
(In the router, use `Depends(require_clerk)` where `require_clerk` is a tiny local Header wrapper delegating to `get_clerk_user_id` — same shape as `main.py`'s `require_clerk_user_id`, defined in the router file to avoid the circular import.)

**Step 2: Run → FAIL (404).**

**Step 3: Implement**

```python
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
    public_reply_enabled: bool = False
    public_reply_message: str | None = Field(default=None, max_length=2000)

    @field_validator("keywords")
    @classmethod
    def _strip_keywords(cls, v: list[str]) -> list[str]:
        cleaned = [k.strip() for k in v if k.strip()]
        if not cleaned:
            raise ValueError("at least one non-empty keyword is required")
        return cleaned


class AutomationPatch(BaseModel):
    name: str | None = None
    keywords: list[str] | None = None
    match_mode: str | None = Field(default=None, pattern="^(whole_word|partial)$")
    dm_message: str | None = None
    public_reply_enabled: bool | None = None
    public_reply_message: str | None = None
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
        "opening_dm_mode": "direct", "track_links": False, "bound_media_ids": [],
        "status": "active", "created_at": now, "updated_at": now,
    })
    return {"automation": row}


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
```

**Step 4: Wire** — in `api/main.py`: `app.include_router(automations_router)` (import from `api.routes.automations`).

**Step 5: Run → 6+ tests pass.**
**Step 6: Commit** — `git add api/routes/automations.py api/main.py api/tests/test_automations_route.py && git commit -m "feat: automations CRUD + logs endpoints"`

---

# PHASE 1 — APP (Expo)

## Task 13: `src/lib/automations.ts` (FastAPI client + types)

**Files:**
- Create: `src/lib/automations.ts`
- Test: `src/__tests__/automations-client.test.ts`

**Step 1: Write the failing test** — mock `fetch`, assert URL/method/headers/body for `createAutomation`; assert 401 maps to `Error('session_expired')`; assert `listAutomations` parses `{automations: [...]}`.

**Step 2: Run** — `bun test src/__tests__/automations-client.test.ts` → FAIL (module missing).

**Step 3: Implement** — follow `src/lib/instagram.ts` exactly: same `API_BASE_URL` env, `getAuthHeaders()` (import it from `./instagram` — export it there if it isn't already), `fetchWithTimeout`, 401→`'session_expired'`, `executeWithRetry` for GETs:

```typescript
// src/lib/automations.ts
/** FastAPI client for the comment-automation engine. Mirrors instagram.ts conventions. */
import { executeWithRetry } from './resilient';
import { getAuthHeaders, fetchWithTimeout } from './instagram';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;

export type TargetType = 'all_posts' | 'specific_posts' | 'next_reel';
export type MatchMode = 'whole_word' | 'partial';
export type AutomationStatus = 'active' | 'paused' | 'error';
export type OpeningDmMode = 'direct' | 'button';

export interface Automation {
  $id: string;
  clerk_user_id: string;
  ig_user_id: string;
  name: string;
  target_type: TargetType;
  media_ids: string[];
  bound_media_ids: string[];
  keywords: string[];
  match_mode: MatchMode;
  opening_dm_mode: OpeningDmMode;
  dm_message: string;
  button_text: string | null;
  reveal_message: string | null;
  track_links: boolean;
  public_reply_enabled: boolean;
  public_reply_message: string | null;
  status: AutomationStatus;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  $id: string;
  automation_id: string;
  comment_id: string;
  commenter_username: string | null;
  comment_text: string | null;
  matched_keyword: string | null;
  action: 'pending' | 'dm_sent' | 'button_dm_sent' | 'reveal_sent' | 'reply_sent' | 'skipped' | 'failed';
  reason: string | null;
  created_at: string;
}

export interface CreateAutomationInput {
  name: string;
  target_type: TargetType;
  media_ids?: string[];
  keywords: string[];
  match_mode: MatchMode;
  dm_message: string;
  public_reply_enabled: boolean;
  public_reply_message?: string | null;
}

export type PatchAutomationInput = Partial<CreateAutomationInput & { status: 'active' | 'paused' }>;

async function request<T>(path: string, init: RequestInit, retry: boolean): Promise<T> {
  if (!API_BASE_URL) throw new Error('EXPO_PUBLIC_IG_API_BASE_URL is not set');
  const call = async (): Promise<T> => {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: await getAuthHeaders(),
    });
    if (res.status === 401) throw new Error('session_expired');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`automations request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  };
  return retry ? executeWithRetry(call) : call();
}

export async function listAutomations(): Promise<Automation[]> {
  const data = await request<{ automations: Automation[] }>('/automations', { method: 'GET' }, true);
  return data.automations;
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>('/automations', {
    method: 'POST', body: JSON.stringify(input),
  }, false);
  return data.automation;
}

export async function updateAutomation(id: string, patch: PatchAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>(`/automations/${id}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  }, false);
  return data.automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  await request<null>(`/automations/${id}`, { method: 'DELETE' }, false);
}

export async function listAutomationLogs(id: string): Promise<AutomationLog[]> {
  const data = await request<{ logs: AutomationLog[] }>(`/automations/${id}/logs`, { method: 'GET' }, true);
  return data.logs;
}
```

(If `getAuthHeaders`/`fetchWithTimeout` aren't exported from `instagram.ts` today, add `export` to their declarations — no behavior change.)

**Step 4: Run → pass.**
**Step 5: Commit** — `git add src/lib/automations.ts src/__tests__/automations-client.test.ts src/lib/instagram.ts && git commit -m "feat: automations FastAPI client"`

---

## Task 14: `src/hooks/useAutomations.ts`

**Files:**
- Create: `src/hooks/useAutomations.ts`
- Test: `src/__tests__/useAutomations.test.tsx`

**Step 1: Write the failing test** — follow existing hook-test conventions (`jest.mock('@/lib/automations')`, `defaultMockReturn` spread, `await render(...)`, state-based assertions): (a) loading → returns `loading: true`; (b) data → automations array; (c) error → error string; (d) `toggleStatus` calls `updateAutomation` with flipped status and invalidates the query.

**Step 2: Run → FAIL.**

**Step 3: Implement** — react-query pattern from `useMessages.ts`, `withFreshSession` wrapper from `useCreatorProfile.ts`:

```typescript
// src/hooks/useAutomations.ts
import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAutomation,
  deleteAutomation,
  listAutomationLogs,
  listAutomations,
  updateAutomation,
  type Automation,
  type AutomationLog,
  type CreateAutomationInput,
  type PatchAutomationInput,
} from '@/lib/automations';
import { withFreshSession } from '@/lib/with-fresh-session';

export function useAutomations() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automations', user?.id],
    enabled: !!user,
    queryFn: () => withFreshSession(() => listAutomations(), getToken),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['automations'] });

  const toggle = useMutation({
    mutationFn: (automation: Automation) =>
      withFreshSession(
        () => updateAutomation(automation.$id, {
          status: automation.status === 'active' ? 'paused' : 'active',
        }),
        getToken,
      ),
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: (input: CreateAutomationInput) =>
      withFreshSession(() => createAutomation(input), getToken),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => withFreshSession(() => deleteAutomation(id), getToken),
    onSuccess: invalidate,
  });

  return {
    automations: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message === 'session_expired' ? 'session_expired' : (query.error?.message ?? null),
    refresh: query.refetch,
    toggleStatus: toggle.mutateAsync,
    createAutomation: create.mutateAsync,
    deleteAutomation: remove.mutateAsync,
    creating: create.isPending,
  };
}

export function useAutomationLogs(automationId: string) {
  const { getToken } = useAuth();
  const query = useQuery({
    queryKey: ['automationLogs', automationId],
    enabled: !!automationId,
    queryFn: () => withFreshSession(() => listAutomationLogs(automationId), getToken),
  });
  return {
    logs: query.data ?? [] as AutomationLog[],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}
```

**Step 4: Run → pass.**
**Step 5: Commit** — `git add src/hooks/useAutomations.ts src/__tests__/useAutomations.test.tsx && git commit -m "feat: useAutomations + useAutomationLogs hooks"`

---

## Task 15: `(automate)` route group + 6th tab in ClayTabBar

**Files:**
- Create: `src/app/(tabs)/(automate)/_layout.tsx`
- Create: `src/app/(tabs)/(automate)/index.tsx` (placeholder — real screen in Task 16)
- Modify: `src/app/(tabs)/_layout.tsx` (add `(automate)` screen)
- Modify: `src/components/clay/ClayTabBar.tsx` (add tab entry)

**Step 1: Route group layout** — follow `(messages)/_layout.tsx`'s Stack pattern:

```tsx
// src/app/(tabs)/(automate)/_layout.tsx
import { Stack } from 'expo-router';

export default function AutomateLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="new" />
      <Stack.Screen name="[automationId]" />
    </Stack>
  );
}
```

**Step 2: Placeholder index** (replaced in Task 16):

```tsx
// src/app/(tabs)/(automate)/index.tsx
import { Text, View } from '@/tw';

export default function AutomateScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-clay-canvas">
      <Text className="text-clay-text">Automations</Text>
    </View>
  );
}
```

**Step 3: Register the tab** — in `src/app/(tabs)/_layout.tsx` add between `(home)` and `(messages)`:
```tsx
<Tabs.Screen name="(automate)" />
```

In `src/components/clay/ClayTabBar.tsx` add to the tab config (mirror existing entries' shape):
```tsx
{ name: '(automate)', title: 'Automate', icon: 'flash-outline', activeIcon: 'flash' },
```
(If ClayTabBar keys off route names, place the entry so order is Home, Automate, Messages, Publish, Insights, Profile. Verify `Ionicons` has `flash`/`flash-outline` — it does.)

**Step 4: Verify** — `bun run lint` clean; `bun start --android` (or web) shows 6 tabs, Automate renders the placeholder.

**Step 5: Commit** — `git add "src/app/(tabs)" src/components/clay/ClayTabBar.tsx && git commit -m "feat: Automate tab skeleton (6th tab)"`

---

## Task 16: Automate home screen

**Files:**
- Modify: `src/app/(tabs)/(automate)/index.tsx`
- Test: `src/__tests__/automate-home.test.tsx`

**Step 1: Write the failing test** — mock `@/hooks/useAutomations` (loading / error / empty / 2-automations states via `defaultMockReturn` spread): empty state shows the connect/create CTA; list state renders both automation names; toggle calls `toggleStatus`.

**Step 2: Run → FAIL (placeholder doesn't render these).**

**Step 3: Implement** — replace the placeholder. Follow `(messages)/index.tsx` (FlatList + ClayAnimatedCard + status badges) and Home's `Module` card pattern. Structure:

- **Header**: "Automations" title + subtitle "Auto-DM when followers comment keywords".
- **Overview stats card placeholder** (filled by Task 23): three counters reading `--` with a "Stats arrive after your first sends" caption.
- **Connection gate** (from Task 19's `useAutomationGate`): if no OAuth token → `ClayAnimatedCard` with "Connect Instagram to enable automations" + button calling `startInstagramOAuth(clerkId, appwriteUserId)`; hide list behind it.
- **List**: each automation row = `ClayAnimatedCard` with name, target summary ("All posts" / "3 posts" / "Next reel"), keywords preview (first 3 + "+n"), sent count badge, and a status `Switch` (`toggleStatus(automation)`). Error status → red "Reconnect needed" badge.
- **Empty state**: "No automations yet" + "Create your first" button → `router.push('/(tabs)/(automate)/new')`.
- **FAB / header button**: "+" → builder.
- Row tap → `router.push(`/(tabs)/(automate)/${automation.$id}`)`.

Use `@/tw` primitives (`View`, `Text`, `ScrollView`/`FlatList`, `Pressable`), `cn()`, and Clay components per `src/components/clay/AGENTS.md`. Reanimated imports via `@/lib/reanimated-platform` only.

**Step 4: Run → pass. `bun run lint` clean.**
**Step 5: Commit** — `git add "src/app/(tabs)/(automate)/index.tsx" src/__tests__/automate-home.test.tsx && git commit -m "feat: Automate home screen (list + toggles + gate)"`

---

## Task 17: Campaign builder screen

**Files:**
- Create: `src/app/(tabs)/(automate)/new.tsx`
- Test: `src/__tests__/automate-new.test.tsx`

**Step 1: Write the failing test** — validation logic: submit disabled until name + ≥1 keyword + dm_message; `specific_posts` requires ≥1 selected post; `public_reply_enabled` requires reply text. (Extract validation into an exported pure function `validateAutomationDraft(draft)` in the screen file or `src/lib/automation-validation.ts` so it's unit-testable without rendering.)

**Step 2: Run → FAIL.**

**Step 3: Implement** — single-scroll form (pattern: AuthScreen field styling, `clayInput`/`clayCard` from `@/tw/cn`). Sections in order:

1. **Name** — `TextInput` (clayInput).
2. **Target** — 3-option segmented control: "All posts" / "Specific posts" / "Next reel". "Specific posts" opens a multi-select list of the creator's posts (`listPosts` from `@/lib/repository` via the existing `POSTS` table pattern used by `useCreatorProfile`). "Next reel" shows an explainer caption ("Automatically applies to every new reel you post").
3. **Keywords** — chip input: `TextInput` + "Add" button; chips with remove ×. Match-mode toggle: "Whole word" (default, explainer: '"link" won't match "linking"') vs "Contains".
4. **Opening DM** — Phase 1: direct message only (mode selector is hidden until Task 20). `TextInput` multiline with `{username}` hint ("We'll replace {username} with the commenter's name") and live character count (2000 cap).
5. **Public reply** — toggle + multiline input (optional, same personalization hint).
6. **Preview card** — clay card rendering the DM as the follower will see it: `{username}` replaced with `@yourfan`, keywords highlighted.
7. **Activate** — `ClayAnimatedButton`; on success `router.back()` (list invalidates via react-query).

On submit: build `CreateAutomationInput`, call `createAutomation` from `useAutomations`, map 409 `instagram_not_connected` to the gate CTA.

**Step 4: Run → pass. `bun run lint` clean.**
**Step 5: Commit** — `git add "src/app/(tabs)/(automate)/new.tsx" src/__tests__/automate-new.test.tsx && git commit -m "feat: campaign builder screen"`

---

## Task 18: Automation detail screen

**Files:**
- Create: `src/app/(tabs)/(automate)/[automationId].tsx`
- Test: `src/__tests__/automate-detail.test.tsx`

**Step 1: Write the failing test** — mock `@/hooks/useAutomations` + `useAutomationLogs`: renders log rows (username, action badge, matched keyword); pause button calls `updateAutomation` with `status: 'paused'`; delete shows confirm then calls `deleteAutomation`.

**Step 2: Run → FAIL.**

**Step 3: Implement** — follow `(messages)/[threadId].tsx` layout (header + FlatList + footer actions):

- **Header**: automation name + status badge; back chevron.
- **Stats strip** (Phase 1: computed client-side from logs): sent / skipped / failed counts.
- **Config summary card**: target, keywords, match mode, DM text (truncated), public reply on/off.
- **Activity feed**: `FlatList` of logs, newest first — each row: commenter username, comment text (1 line), matched keyword chip, action badge (color-coded: sent=teal, skipped=ochre, failed=pink), relative time.
- **Actions row**: Pause/Resume (`ClayAnimatedButton` secondary), Delete (destructive, `Alert.alert` confirm).

`useLocalSearchParams<{ automationId: string }>()` for the id; find the automation in `useAutomations().automations` (no separate fetch needed in Phase 1).

**Step 4: Run → pass. `bun run lint` clean.**
**Step 5: Commit** — `git add "src/app/(tabs)/(automate)/[automationId].tsx" src/__tests__/automate-detail.test.tsx && git commit -m "feat: automation detail screen (activity feed + actions)"`

---

## Task 19: Connection gate hook

**Files:**
- Create: `src/hooks/useAutomationGate.ts`
- Modify: `src/app/(tabs)/(automate)/index.tsx` + `new.tsx` (use the gate)
- Test: `src/__tests__/useAutomationGate.test.tsx`

**Step 1: Write the failing test** — mock `getCreatorByClerkId` (`@/lib/repository`): creator with `access_token` → `connected: true`; without → `connected: false`; `connect()` calls `startInstagramOAuth` with clerk id + appwrite uid and refreshes on success.

**Step 2: Run → FAIL.**

**Step 3: Implement**

```typescript
// src/hooks/useAutomationGate.ts
import { useAuth, useUser } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { getCreatorByClerkId } from '@/lib/repository';

/** Gate: automations need an OAuth-connected IG professional account
 *  (creators.access_token present). connect() runs the existing OAuth flow. */
export function useAutomationGate() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automationGate', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const creator = await getCreatorByClerkId(user!.id);
      return { connected: !!creator?.access_token, appwriteUserId: creator?.$id ?? null };
    },
  });

  const connect = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    const appwriteUserId = query.data?.appwriteUserId;
    if (!appwriteUserId) throw new Error('Profile not ready — try again in a moment');
    await startInstagramOAuth(user.id, appwriteUserId);
    await queryClient.invalidateQueries({ queryKey: ['automationGate'] });
    await queryClient.invalidateQueries({ queryKey: ['creator'] });
  }, [user, query.data?.appwriteUserId, queryClient]);

  return {
    connected: query.data?.connected ?? false,
    loading: query.isLoading,
    connect,
  };
}
```

**Step 4: Run → pass. Wire into the two screens (replace Task 16's inline gate logic). `bun run lint` clean.**
**Step 5: Commit** — `git add src/hooks/useAutomationGate.ts "src/app/(tabs)/(automate)" src/__tests__/useAutomationGate.test.tsx && git commit -m "feat: automation connection gate (OAuth prerequisite)"`

**Phase 1 exit check:** backend `python -m pytest api/tests/ -v` all green; app `bun test` all green; `bun run lint` clean; manual smoke — create automation in dev build against a dev-mode test account, comment on a test post from a second account, DM arrives.

---

# PHASE 2 — GROWTH FEATURES

## Task 20: Button-DM + postback reveal flow

**Files:**
- Modify: `api/automation_worker.py` (STEP 8 — button mode branch)
- Modify: `api/routes/webhooks.py` (queue `send_reveal` jobs from postback events)
- Modify: `api/routes/automations.py` (accept `opening_dm_mode`, `button_text`, `reveal_message` + validation)
- Modify: `src/app/(tabs)/(automate)/new.tsx` (opening-DM mode selector)
- Modify: `src/lib/automations.ts` (`CreateAutomationInput` gains the 3 fields)
- Test: `api/tests/test_automation_worker.py` (+2 cases), `api/tests/test_webhooks_route.py` (+1 case)

**Step 1: Failing tests**
- Worker: automation with `opening_dm_mode="button"` → `send_private_reply_with_button` called with payload `f"reveal:{automation_id}"`, log action `button_dm_sent`.
- Webhook: POST with a `messaging_postbacks` entry → `send_reveal` job created with `{instagram_account_id, user_id, automation_id}` parsed from payload `reveal:{id}`.

**Step 2: Implement**

Worker STEP 8 branch (replaces the direct-only call):
```python
            if auto.get("opening_dm_mode") == "button" and auto.get("button_text") and auto.get("reveal_message"):
                await graph_client.send_private_reply_with_button(
                    ig_id, event["comment_id"],
                    personalize(auto["dm_message"], event.get("commenter_name")),
                    auto["button_text"], f"reveal:{auto['$id']}",
                    access_token=token)
                store.update_log(log["$id"], {"action": "button_dm_sent", "reason": None})
            else:
                await graph_client.send_private_reply(
                    ig_id, event["comment_id"],
                    personalize(auto["dm_message"], event.get("commenter_name")),
                    access_token=token)
                store.update_log(log["$id"], {"action": "dm_sent", "reason": None})
```

Webhook route — replace the Task-11 postback placeholder:
```python
    for event in parse_postback_events(payload):
        if event.payload.startswith("reveal:"):
            job = store.create_job("send_reveal", {
                "instagram_account_id": event.instagram_account_id,
                "user_id": event.user_id,
                "automation_id": event.payload.removeprefix("reveal:"),
            })
            background_tasks.add_task(run_job_safe, store, job["$id"])
```

Worker `run_job` — dispatch on `job["type"]`: `"send_reveal"` → load automation (ownership by ig), decrypt token, `send_direct_message(ig_id, user_id, personalize(automation["reveal_message"], None))`, log row with action `reveal_sent` (comment_id = `postback:{user_id}` to keep the attribute satisfied).

Automations route: extend `AutomationCreate`/`AutomationPatch` with `opening_dm_mode` (`direct|button`), `button_text` (max 20 — Meta cap), `reveal_message` (max 2000); 422 when mode=`button` and either field missing/blank. Builder: segmented "Direct message" / "Button reveal" selector + the two extra inputs when button mode is on; preview shows the button.

**Step 3: Run → all pass. Commit** — `feat: button-DM opening flow with postback reveal`

---

## Task 21: Tracked links (`/r/{slug}`)

**Files:**
- Create: `api/tracked_links.py`
- Create: `api/routes/tracked_links.py` (`GET /r/{slug}`)
- Modify: `api/automation_store.py` (+`create_tracked_link`, `get_tracked_link`, `record_click`, `count_clicks`)
- Modify: `api/automation_worker.py` (message rendering with tracking)
- Modify: `api/routes/automations.py` (accept `track_links`; on create, extract first URL from `dm_message`/`reveal_message` → mint slug row)
- Modify: `api/main.py` (include router)
- Test: `api/tests/test_tracked_links.py`

**Step 1: Failing tests** — port of `lib/tracking/message.ts` behavior:
- `render_message_with_tracking("Hey {username}: https://x.com/p", "fan", slug="abc", base="https://api.example.com")` → `"Hey fan: https://api.example.com/r/abc"`.
- `{link}` placeholder wins over raw-URL replacement; trailing-slash variants handled; `{username}` null → `"there"`.
- `GET /r/abc` → 302 to `target_url` + `record_click` called; unknown slug → 404.

**Step 2: Implement**

```python
# api/tracked_links.py
"""Tracked links — port of openreply's lib/tracking/message.ts (MIT)."""
import re
import secrets

URL_PATTERN = re.compile(r"https?://[^\s<>\"')\]]+", re.IGNORECASE)


def new_slug() -> str:
    return secrets.token_urlsafe(6).replace("-", "").replace("_", "")[:8]


def extract_first_url(message: str) -> str | None:
    m = URL_PATTERN.search(message or "")
    return m.group(0).rstrip(".,!?;:") if m else None


def render_message_with_tracking(message: str, commenter_name: str | None,
                                 tracked_url: str | None, destination_url: str | None) -> str:
    rendered = re.sub(r"\{username\}", commenter_name or "there", message or "", flags=re.IGNORECASE)
    if not tracked_url or not destination_url:
        return rendered
    if re.search(r"\{link\}", rendered, re.IGNORECASE):
        return re.sub(r"\{link\}", tracked_url, rendered, flags=re.IGNORECASE)
    if destination_url in rendered:
        return rendered.replace(destination_url, tracked_url)
    return rendered.replace(destination_url.rstrip("/"), tracked_url)
```

Worker: when `auto["track_links"]`, look up the automation's tracked link (store `get_tracked_link_for_automation`), build `tracked_url = f"{PUBLIC_BASE_URL}/r/{slug}"`, and render DM/reveal via `render_message_with_tracking` instead of plain `personalize`.

Redirect route:
```python
@router.get("/r/{slug}")
async def tracked_redirect(slug: str):
    store = get_automation_store()
    link = store.get_tracked_link(slug)          # row $id IS the slug
    if not link:
        raise HTTPException(status_code=404)
    store.record_click(slug)                      # link_clicks row, clicked_at=now
    return RedirectResponse(link["target_url"], status_code=302)
```

**Step 3: Run → pass. Commit** — `feat: tracked links with click logging (/r/{slug})`

---

## Task 22: Campaign templates + builder picker

**Files:**
- Create: `api/campaign_templates.py` (static data)
- Modify: `api/routes/automations.py` (`GET /campaign-templates` — mount BEFORE `/{automation_id}` route or use a distinct prefix to avoid the path param swallowing it; safest: `GET /automations/templates` defined above `GET /automations/{automation_id}`)
- Modify: `src/lib/automations.ts` (+ `CampaignTemplate` type + `listCampaignTemplates()`)
- Modify: `src/app/(tabs)/(automate)/new.tsx` (template picker as step 0)
- Test: `api/tests/test_automations_route.py` (+1), `src/__tests__/automations-client.test.ts` (+1)

**Step 1: Implement** — the 8 templates, ported verbatim (MIT) from openreply's `lib/templates/campaign-templates.ts`:

```python
CAMPAIGN_TEMPLATES = [
    {"slug": "dtc-product-link", "title": "DTC Product Link Drop",
     "keywords": ["LINK", "SHOP", "BUY"],
     "dm_message": "Hey {username}, here is the product link you asked for: https://yourstore.com/product"},
    {"slug": "real-estate-lead-form", "title": "Real Estate Lead Form",
     "keywords": ["HOME", "LISTING", "VALUE"],
     "dm_message": "Hey {username}, here is the form to get the property details and next available showing slots: https://yourlink.com/home"},
    {"slug": "fitness-plan", "title": "Fitness Plan Download",
     "keywords": ["PLAN", "FIT", "START"],
     "dm_message": "Hey {username}, here is the free plan from the reel: https://yourlink.com/fitness-plan"},
    {"slug": "course-webinar", "title": "Course Webinar Invite",
     "keywords": ["WEBINAR", "CLASS", "LEARN"],
     "dm_message": "Hey {username}, here is the free class registration link: https://yourlink.com/webinar"},
    {"slug": "beauty-price-list", "title": "Beauty Service Price List",
     "keywords": ["PRICE", "MENU", "BOOK"],
     "dm_message": "Hey {username}, here is our service menu and booking link: https://yourlink.com/booking"},
    {"slug": "restaurant-menu", "title": "Restaurant Menu And Reservation",
     "keywords": ["MENU", "TABLE", "RESERVE"],
     "dm_message": "Hey {username}, here is our menu and reservation link: https://yourlink.com/menu"},
    {"slug": "event-rsvp", "title": "Event RSVP Campaign",
     "keywords": ["RSVP", "TICKET", "JOIN"],
     "dm_message": "Hey {username}, here is the RSVP link with event details: https://yourlink.com/rsvp"},
    {"slug": "creator-media-kit", "title": "Creator Media Kit Reply",
     "keywords": ["COLLAB", "KIT", "RATES"],
     "dm_message": "Hey {username}, here is my media kit and partnership form: https://yourlink.com/media-kit"},
]
```

Builder: horizontal template card row at the top ("Start from a template" / "Blank"); tapping one pre-fills name, keywords, and `dm_message` (still editable).

**Step 2: Run → pass. Commit** — `feat: 8 campaign templates (ported) + builder picker`

---

## Task 23: Stats endpoints + Automate home overview card

**Files:**
- Modify: `api/automation_store.py` (+`count_logs_by_action(automation_id)`, `count_logs_by_action_since(clerk_user_id, since_iso)`, `top_keywords(clerk_user_id, since_iso, limit)` — read rows and aggregate in Python; volumes are small)
- Modify: `api/routes/automations.py` (+`GET /automations/{id}/stats`, `GET /automations/stats/overview` — define overview route BEFORE `/{automation_id}`)
- Modify: `src/lib/automations.ts` (+ types + `getAutomationStats`, `getOverviewStats`)
- Modify: `src/app/(tabs)/(automate)/index.tsx` (fill the overview card) + `[automationId].tsx` (real stats strip)
- Test: route tests for both endpoints (aggregations correct over fake store)

**Shapes:**
```json
GET /automations/{id}/stats ->
{"sent": 41, "skipped": 3, "failed": 1, "clicks": 12, "ctr": 0.29, "top_keywords": [["LINK", 30], ["SHOP", 11]], "daily": [{"date": "2026-07-23", "sent": 5}, ...7 days]}

GET /automations/stats/overview ->
{"sent_7d": 128, "clicks_7d": 31, "ctr_7d": 0.24, "top_keyword_7d": "LINK", "active_automations": 3}
```
CTR = clicks / DMs sent in the same window (0 when denominator is 0). `daily` = per-day `dm_sent`+`button_dm_sent` counts for the trailing 7 days.

Home overview card: "DMs sent (7d)" / "Link clicks (7d)" / "Top keyword" + active-automation count.

**Commit** — `feat: automation stats endpoints + overview card`

---

## Task 24: Token-refresh cron

**Files:**
- Create: `api/routes/cron.py`
- Modify: `api/main.py` (include router)
- Modify: `api/automation_store.py` (+`list_creators_with_token_expiring_before(iso)`)
- Test: `api/tests/test_cron.py`

**Step 1: Failing tests** — wrong/missing `X-Cron-Secret` → 401; creator expiring in 5 days → `refresh_long_lived_token` called, row updated with new encrypted token + new expiry (fake graph via monkeypatch); already-failed refresh → row untouched, error counted in response.

**Step 2: Implement**

```python
# api/routes/cron.py
"""Scheduled jobs — protected by a shared secret (X-Cron-Secret header).
Invoke from any scheduler (cron loop, GitHub Actions, uptime monitor)."""
import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Header, HTTPException
from loguru import logger

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
    for creator in store.list_creators_with_token_expiring_before(threshold):
        if not creator.get("access_token"):
            continue
        try:
            token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
            out = await refresh_long_lived_token(token)
            store.update_creator_token(
                creator["$id"],
                get_token_crypto().encrypt(out["access_token"]),
                (datetime.now(timezone.utc) + timedelta(seconds=out["expires_in"])).isoformat(),
            )
            refreshed += 1
        except Exception as exc:
            failed += 1
            logger.error("token refresh failed for creator {}: {}", creator.get("$id"), exc)
    return {"refreshed": refreshed, "failed": failed}
```

(`update_creator_token` on the store wraps the creators-table row update. Scheduling itself is infra: document `curl -X POST -H "X-Cron-Secret: $CRON_SECRET" $PUBLIC_BASE_URL/cron/refresh-tokens` daily in the route docstring.)

**Step 3: Run → pass. Commit** — `feat: token refresh cron endpoint`

---

# PHASE 3 — HARDENING

## Task 25: Comment reconciler (polling safety net)

**Files:**
- Create: `api/comment_reconciler.py`
- Modify: `api/routes/cron.py` (`POST /cron/reconcile`)
- Modify: `api/automation_store.py` (+`list_all_active_automations()`)
- Test: `api/tests/test_comment_reconciler.py`

**Step 1: Failing tests** — fake store + fake graph: (a) comment matching a keyword with no existing log → `process_comment` job created; (b) comment already logged → no job; (c) creator's own comment (from.id == automation's ig_user_id) → no job; (d) comment older than 72h → excluded by the `since_ms` query arg (assert the arg).

**Step 2: Implement** — port of openreply's `lib/polling/comment-reconciler.ts` (72h lookback, capped sweep):

```python
# api/comment_reconciler.py
"""Polling safety net — catches comments webhooks miss. Port of openreply's
lib/polling/comment-reconciler.ts (MIT). For each active automation, scan the
target media's comments from the last 72h; enqueue unmatched ones as jobs.
Dedup in the worker makes double-processing a no-op."""
from __future__ import annotations

from dataclasses import asdict
from datetime import datetime, timedelta, timezone

from loguru import logger

from api import graph_client
from api.keyword_matcher import match_keywords
from api.token_crypto import decrypt_or_plaintext, get_token_crypto
from api.webhook_security import CommentEvent

LOOKBACK_HOURS = 72
MAX_MEDIA_PER_AUTOMATION = 10


async def reconcile_once(store) -> dict:
    since_ms = int((datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)).timestamp() * 1000)
    enqueued = 0
    for auto in store.list_all_active_automations():
        creator = store.get_creator_by_clerk_id(auto["clerk_user_id"])
        if not creator or not creator.get("access_token"):
            continue
        token = decrypt_or_plaintext(creator["access_token"], get_token_crypto())
        media_ids = list(auto.get("media_ids") or []) + list(auto.get("bound_media_ids") or [])
        if auto["target_type"] == "all_posts":
            media = await graph_client.get_user_media(limit=MAX_MEDIA_PER_AUTOMATION, access_token=token)
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
                if store.find_log(auto["$id"], c["id"]):
                    continue
                if not match_keywords(c.get("text") or "", auto.get("keywords") or [],
                                      auto.get("match_mode", "whole_word") == "whole_word").matched:
                    continue
                store.create_job("process_comment", asdict(CommentEvent(
                    instagram_account_id=auto["ig_user_id"],
                    comment_id=c["id"],
                    comment_text=c.get("text") or "",
                    commenter_id=commenter.get("id", ""),
                    commenter_name=commenter.get("username"),
                    media_id=media_id,
                )))
                enqueued += 1
    return {"enqueued": enqueued}
```

Cron route addition: `POST /cron/reconcile` (same `_check_secret`) → `await reconcile_once(store)`. Document daily/hourly scheduling in the docstring.

**Step 3: Run → pass. Commit** — `feat: comment reconciler polling safety net (port)`

---

## Task 26: "Next reel" auto-attach

**Files:**
- Modify: `api/comment_reconciler.py` (+`attach_next_reels(store)`)
- Modify: `api/routes/cron.py` (call it from `/cron/reconcile`)
- Test: `api/tests/test_comment_reconciler.py` (+2 cases)

**Logic** — for each active automation with `target_type == "next_reel"`: fetch `get_user_media(limit=1)`; if the newest media id is not in `bound_media_ids`, append it (`update_automation`) and log. Builder screen already exposes the "Next reel" target (Task 17); the worker already matches `bound_media_ids` (Task 10).

**Commit** — `feat: next-reel auto-attach for automations`

---

## Task 27: Raw webhook event log

**Files:**
- Modify: `api/automation_store.py` (+`record_webhook_event(payload)`)
- Modify: `api/routes/webhooks.py` (record after signature check, before parsing)
- Test: `api/tests/test_webhooks_route.py` (+1: valid POST → store recorded the raw payload)

One-liner in the POST handler: `store.record_webhook_event(raw.decode())` inside a try/except that never fails the webhook. Payloads > 16000 chars truncated before insert.

**Commit** — `feat: raw webhook event log for debugging`

---

## Task 28: Worker health surface

**Files:**
- Modify: `api/automation_store.py` (+`count_jobs_by_status()`)
- Modify: `api/routes/cron.py` (`GET /cron/health` — same secret) OR `api/main.py` (`GET /automation-health`, unauthenticated is fine — counts only)
- Test: 1 route test

Response: `{"pending": n, "processing": n, "failed": n, "done": n, "last_webhook_event_at": iso|null}` — point uptime monitoring at it; alert when `failed` grows or `pending` stays > 50.

**Commit** — `feat: automation worker health endpoint`

**Phase 3 exit check:** full backend + app suites green; reconciler e2e on dev-mode test accounts (kill webhook delivery, comment, run `/cron/reconcile`, DM still arrives).

---

# USER TRACK — LAUNCH GATES (owner: user, parallel to all phases)

## Task 29: Meta Developer Portal webhook configuration

1. App Dashboard → your app → **Webhooks** (or Instagram → Webhooks).
2. Callback URL: `https://<deployed-api-host>/webhooks/instagram`.
3. Verify token: the `WEBHOOK_VERIFY_TOKEN` value from `api/.env`.
4. Subscribe to fields: **`comments`** and **`messages`** (messaging postbacks ride the messages field).
5. Confirm the deployed backend has the same `INSTAGRAM_APP_SECRET` / `WEBHOOK_VERIFY_TOKEN` env values as `api/.env`.

Done-when: Meta's "Test" button for the comments field returns 200 from our endpoint (check server logs for `webhook_events`).

## Task 30: App Review submission

After Phase 1 exit check passes (record the screencast THEN):
1. App Review → Permissions and Features → request **Advanced Access** for `instagram_business_manage_comments` and `instagram_business_manage_messages`.
2. For each: "Creator configures a keyword automation in the Kaplun app; when a follower comments the keyword on their post, our backend sends the creator's pre-written DM via the Instagram API" + screencast of: builder → activate → comment on test post → DM arrives → activity log entry.
3. Note: `instagram_business_basic`, `instagram_business_manage_insights` typically need no review for standard use.

Done-when: both permissions show "Approved — Advanced Access". Launch to real users waits on this.

## Task 31: End-to-end dev-mode verification script

Repeatable manual script (keep in `docs/plans/` as an appendix or runbook):
1. Test Instagram account A (role in Meta app) connects via OAuth in the dev build → webhook subscription logged.
2. Account A creates an automation via the app: keyword `LINK`, direct DM "Hey {username}, here it is: https://example.com", public reply on.
3. Test account B comments "LINK please" on A's latest post.
4. Within ~30s: B receives the DM; the comment gets the public reply; the app's activity feed shows the `dm_sent` row.
5. Button-mode variant: B taps the button → reveal DM arrives.
6. Tracked-link variant: B taps the link → 302 redirect works; CTR increments in the overview card.

---

# Appendix A — Execution notes

- **Order**: Tasks 1→2 (manual Appwrite step can run parallel with 3–4) → 3,4,5,7,8,9 → 10 → 11 → 12 → 6 → app tasks 13–19 → Phase 2 (20–24, any order except 21 before 23's CTR) → Phase 3 (25–28) → user track gates launch.
- **Every ported file carries the MIT attribution header** (openreply, Copyright (c) 2026 Anish Raj, Diwen Huang).
- **Commit after every task**; never batch tasks into one commit.
- If an Appwrite `Query` operator name differs in the installed SDK version, check `appwrite.query` source and adapt — don't bypass with client-side filtering on unbounded tables.
- Backend convention reminders: dict error shapes, loguru, request-ID middleware untouched, no global IG client, no instagrapi changes.
- App convention reminders: `@/tw` primitives (not raw `react-native`), `cn()`, Reanimated via `@/lib/reanimated-platform`, no `as any`, no `@ts-ignore`, `addLog()` not `console.log`.

