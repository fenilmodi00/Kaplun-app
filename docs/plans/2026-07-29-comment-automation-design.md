# Comment Automation Engine — Design Doc

**Date:** 2026-07-29
**Status:** Approved (brainstorming complete)
**Source inspiration:** [diwenne/openreply](https://github.com/diwenne/openreply) — MIT License (Copyright (c) 2026 Anish Raj, Diwen Huang). Ported files must carry the MIT attribution header.

---

## 1. Goal

Ship openreply-style Instagram comment automation inside the creator-workspace Expo app: a creator configures keyword triggers on their posts; when a follower comments a matching keyword, the system automatically sends them a private DM (optionally with a button-reveal flow and tracked links) and optionally posts a public comment reply. Offered **free to all users** as a customer-acquisition wedge, surfaced in a **dedicated "Automate" tab**.

## 2. Research summary (why this design)

### 2.1 openreply repo review

- **What it is:** open-source ManyChat alternative. Core loop: comment keyword match → auto private DM + optional public reply. Runs entirely on Meta's **official Graph API v25.0** (OAuth, no scraping).
- **Stack:** Next.js 16 + TypeScript + Postgres/Prisma + Redis/BullMQ + Auth.js. Nothing drops directly into our Expo/FastAPI/Appwrite stack, but the valuable logic is isolated and portable:
  - `lib/utils/keyword-matcher.ts` — ~60-line pure function, near-verbatim port.
  - `lib/meta/client.ts` — plain HTTPS calls (`sendPrivateReply`, `sendCommentReply`, `getRecentMediaComments`), mechanical port to httpx.
  - `lib/meta/webhook.ts` — HMAC-SHA256 verify + event parsers, pure functions.
  - `lib/queue/dm-worker.ts` — orchestration logic (campaign lookup → match → dedup → rate limit → send → log); port the *logic*, replace Prisma/BullMQ with Appwrite/asyncio.
  - `lib/utils/rate-limiter.ts` — 750 DMs/hour/account (Meta's Private Replies limit).
- **No AI** in the repo — replies are static templates with `{username}` personalization.
- **Repo health:** 424 stars, 101 forks, actively maintained (created 2026-07-17).
- **License: MIT** — commercial use, modification, and redistribution permitted with attribution.

### 2.2 Market research

- Every legitimate competitor (ManyChat, Chatfuel, LinkDM, InstantDM, Inrō) uses the official API; instagrapi-based write automation carries real account-ban risk and violates Meta ToS.
- ManyChat's contact-based pricing punishes viral growth. Chatfuel's free tier is keyword-only. SwipeReply charges $49/mo for AI-draft replies. **Gap:** free, mobile-first comment automation inside a broader creator workspace — nobody offers this.
- Meta platform facts: Comment Moderation API supports `GET /{media}/comments`, `POST /{comment}/replies`; Private Replies API = 750 calls/hour/account, one message per commenter, within 7 days of comment, 24h follow-up window; webhooks available for `comments` and `live_comments` fields; requires professional (Business/Creator) account.

### 2.3 Our current state (verified in code)

- **Already built:** full official-API OAuth flow — app side `src/lib/instagram-oauth.ts` (5 scopes including `instagram_business_manage_comments` + `instagram_business_manage_messages`), backend `api/routes/instagram_oauth.py` (code → short token → long-lived token → profile → stored in Appwrite `creators.access_token` + `token_expires_at`).
- **Meta app status:** dev mode (test accounts only). App Review for advanced access is a parallel launch track, not a dev blocker.
- **No existing:** webhook receiver, Graph API comment/DM calls, automation storage, queue, comment UI.
- instagrapi path (`/login`, `/profile`, `/media`, `/insights`) remains for read-only data; automation uses the official API exclusively.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Feature scope | openreply-style automation (not AI drafts, not manual inbox) | User choice; keyword→DM is the repo's proven core |
| Integration approach | **A: Port engine into FastAPI** | One backend, one auth, native mobile UX. B (sidecar) fails on identity; C (instagrapi) fails on safety |
| Detection | Meta webhooks primary; polling reconciler in Phase 3 | Real-time is the product's promise; reconciler catches missed events |
| Queue | Appwrite-backed job table + FastAPI BackgroundTasks + periodic sweeper | No Redis/new infra; durable against crashes |
| Surface | Dedicated **"Automate" tab** (6th tab, bolt icon) | Explicit user requirement |
| Token storage | AES-256-GCM encryption at rest (ported from openreply) | Security fix — tokens currently plaintext |
| Pricing | Free for all users in v1 | Customer-acquisition wedge |

## 4. Feature scope (15 ported features)

1. Keyword → auto DM (core)
2. Optional public comment reply (per-campaign toggle)
3. Opening DM with button ("tap to reveal" postback flow)
4. Tracked links (`/r/{slug}` redirect + click logging)
5. `{username}` template personalization
6. 750 DMs/hour/account rate limiting with requeue-backoff
7. 8 campaign templates (ported static data, template picker)
8. Dashboard stats (sends, CTR, top keywords, 7-day trend)
9. Activity/DM logs (per-automation feed)
10. Polling reconciler (72h lookback safety net)
11. Token auto-refresh cron (10 days before expiry)
12. "Next reel" auto-attach (campaign binds to creator's next published reel)
13. Webhook event log (raw payloads for debugging)
14. Worker health (last-beat timestamps + failure ring buffer)
15. AES-256-GCM token encryption at rest

**Explicitly cut:** multi-account (1 IG account per Clerk user), workspaces/roles/invitations (no team concept), CSV import (mobile), shareable public report pages (needs web surface — v2), DM inbox (overlaps existing Messages tab — merge later), AI-generated replies (openreply has none; possible v2 differentiator).

## 5. Architecture

### 5.1 Data flow (happy path)

```
Follower comments keyword on creator's post
  → Meta POST /webhooks/instagram
    → verify HMAC-SHA256 signature (app secret)
    → parse comment events (skip self-comments)
    → insert automation_jobs row (status=pending)   [durable before ack]
    → 200 OK (fast — Meta requirement)
    → BackgroundTasks: process job
        → load active automations for ig_user_id (+ media match)
        → keyword match (whole-word | partial, case-insensitive)
        → dedup: automation_logs already has (automation_id, comment_id)?
        → rate limit: < 750 DMs in last hour for this account?
            (at cap → requeue job with exponential backoff)
        → [optional] POST /{comment-id}/replies        (public reply)
        → POST /{ig-user-id}/messages                  (private DM)
            direct message OR button template (opening_dm_mode)
        → write automation_logs row (action, matched_keyword)
        → mark job done
  → [button flow] follower taps button
    → Meta POST /webhooks/instagram (messaging_postbacks)
    → parse postback → send reveal_message (with tracked links)
  → [tracked link] follower taps /r/{slug}
    → GET /r/{slug} → insert link_clicks row → 302 to target URL
```

Failures never fail the webhook — they become job retries (3 attempts, backoff, then dead-letter with a log row). A periodic sweeper re-runs stale `pending`/`processing` jobs.

### 5.2 Backend modules (new, under `api/`)

| File | Role | Ported from |
|---|---|---|
| `api/graph_client.py` | Async httpx client for Graph API v25.0: `get_media_comments`, `reply_to_comment`, `send_private_reply`, `send_private_reply_with_button`, `send_reveal_message`, `refresh_long_lived_token` | `lib/meta/client.ts` |
| `api/keyword_matcher.py` | `match_keywords(text, keywords, whole_word) -> matched keyword \| None` (pure) | `lib/utils/keyword-matcher.ts` |
| `api/webhook_security.py` | `verify_signature(payload, signature)`, `parse_comment_events(payload)`, `parse_postback_events(payload)` | `lib/meta/webhook.ts` |
| `api/automation_worker.py` | Job processor: match → dedup → rate limit → send → log; retry/backoff; sweeper | `lib/queue/dm-worker.ts` |
| `api/rate_limiter.py` | 750/hour/account check over `automation_logs`; requeue decision | `lib/utils/rate-limiter.ts` |
| `api/tracked_links.py` | Slug generation, URL substitution into templates, click logging, `GET /r/{slug}` redirect | `lib/tracking/message.ts` |
| `api/token_crypto.py` | AES-256-GCM encrypt/decrypt (key from `TOKEN_ENCRYPTION_KEY` env); plaintext fallback + re-encrypt-on-read migration | `lib/meta/oauth.ts` |
| `api/routes/webhooks.py` | `GET /webhooks/instagram` (verify handshake), `POST /webhooks/instagram` (events) | `app/api/webhook/route.ts` |
| `api/routes/automations.py` | CRUD + logs + stats endpoints (Clerk JWT via `require_clerk_user_id`) | `app/api/automations/route.ts` |
| `api/routes/cron.py` | `POST /cron/refresh-tokens`, reconciler + next-reel sweep (shared-secret auth) | `app/api/cron/*` |
| `api/campaign_templates.py` | 8 pre-built templates (static data) | `lib/templates/campaign-templates.ts` |

All ported files carry the MIT attribution header. Conventions follow `api/AGENTS.md`: dict error shapes, request-ID middleware, loguru, no global IG client.

### 5.3 New endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/webhooks/instagram` | Meta verify token | Webhook handshake |
| POST | `/webhooks/instagram` | HMAC signature | Comment + postback events |
| GET | `/automations` | Clerk JWT | List creator's automations |
| POST | `/automations` | Clerk JWT | Create automation |
| GET | `/automations/{id}` | Clerk JWT | Detail |
| PATCH | `/automations/{id}` | Clerk JWT | Edit / pause / resume |
| DELETE | `/automations/{id}` | Clerk JWT | Delete |
| GET | `/automations/{id}/logs` | Clerk JWT | Activity feed |
| GET | `/automations/{id}/stats` | Clerk JWT | Sends, CTR, top keywords, 7-day trend |
| GET | `/automations/stats/overview` | Clerk JWT | Automate-tab overview card |
| GET | `/campaign-templates` | Clerk JWT | 8 ported templates |
| GET | `/r/{slug}` | — (public) | Tracked-link redirect + click log |
| POST | `/cron/refresh-tokens` | `CRON_SECRET` | Refresh tokens 10d before expiry |
| POST | `/cron/reconcile` | `CRON_SECRET` | Polling reconciler + next-reel attach + job sweeper |

### 5.4 Data model (new Appwrite tables in `vernacular_saas`)

**`automations`**: `automation_id` (pk), `clerk_user_id`, `ig_user_id`, `name`, `target_type` (`all_posts`|`specific_posts`|`next_reel`), `media_ids[]`, `keywords[]`, `match_mode` (`whole_word`|`partial`), `opening_dm_mode` (`direct`|`button`), `dm_message`, `button_text`, `reveal_message`, `track_links` (bool), `public_reply_enabled` (bool), `public_reply_message`, `status` (`active`|`paused`|`error`), `bound_media_ids[]` (next-reel history), `created_at`, `updated_at`

**`automation_logs`**: `log_id` (pk), `automation_id`, `clerk_user_id`, `ig_user_id`, `media_id`, `comment_id`, `commenter_username`, `comment_text`, `matched_keyword`, `action` (`dm_sent`|`button_dm_sent`|`reveal_sent`|`reply_sent`|`skipped`|`failed`), `reason`, `created_at` — dedup store + activity feed + rate-limit counting + stats source.

**`automation_jobs`**: `job_id` (pk), `type` (`process_comment`|`send_reveal`), `payload` (JSON string), `status` (`pending`|`processing`|`done`|`failed`), `attempts`, `run_at`, `created_at`

**`tracked_links`**: `slug` (pk), `automation_id`, `target_url`, `created_at` · **`link_clicks`**: `click_id`, `slug`, `clicked_at`

**`webhook_events`**: `event_id`, `payload` (raw JSON), `received_at` — debugging.

**`creators`** (existing, no schema change): `access_token` value becomes AES-256-GCM ciphertext; `token_expires_at` already present.

### 5.5 App (Expo) structure

New tab group `src/app/(tabs)/(automate)/` + 6th entry in `ClayTabBar` (bolt icon):

| Screen | File | Contents |
|---|---|---|
| Automate home | `(automate)/index.tsx` | Overview stats card (sends this week / CTR / top keyword) + automation list with active toggles + recent activity feed |
| Campaign builder | `(automate)/new.tsx` | Template picker (8) → target (all posts / pick posts from `POSTS` table / next-reel) → keywords + match mode → opening DM (direct or button) → message with `{username}` + auto-tracked-links → optional public reply → preview → activate |
| Automation detail | `(automate)/[automationId].tsx` | Live stats, activity log, pause/edit/delete |

Client layer: `src/lib/automations.ts` (CRUD + stats + templates) using existing `getAuthHeaders` / `fetchWithTimeout` / `withFreshSession` machinery. Hooks: `src/hooks/useAutomations.ts`, `useAutomationDetail.ts`, `useAutomationOverview.ts` — react-query pattern from `useMessages`. Gate: no stored OAuth token → "Connect Instagram (professional account)" CTA via existing `startInstagramOAuth`.

## 6. Error handling

- Webhook: bad signature → 401; processing errors never fail the webhook (job retries).
- Job outcomes: `token_expired` → automation `status=error` + "Reconnect Instagram" surfaced in app; `rate_limited` → requeue with exponential backoff; transient Meta errors → 3 attempts → dead-letter + log row.
- Token refresh failures logged + surfaced on Automate home.
- App: existing `session_expired` recovery (`withFreshSession`) for all automation calls; mutations invalidate react-query caches.
- Meta constraints enforced in worker: one DM per commenter per automation (dedup), 7-day comment-age window (older → skip with log), 750/hour cap.

## 7. Testing

- **Backend (pytest):** keyword matcher unit tests (incl. openreply edge cases: case, punctuation, whole-word boundaries, empty); webhook signature verify (valid/invalid/missing); parsers against captured Meta payloads (comment, postback, self-comment, non-comment events); job processor with mocked graph client (match/skip/dedup/rate-limit/retry/dead-letter); endpoint tests mirroring `tests/test_api_endpoints.py` (TestClient + monkeypatched env + mocked JWT/Appwrite).
- **App (jest-expo):** state-based hook tests (loading/error/empty/data) per project conventions; builder validation tests (keywords required, message required, button_text required when mode=button).
- **E2E (manual script, dev mode):** test account comments keyword on test post → DM arrives → button tap → reveal arrives → tracked link click recorded.

## 8. Parallel track — Meta App Review (owner: user)

1. Configure webhook in Meta Developer Portal: callback `https://<deployed-api>/webhooks/instagram`, verify token (shared secret we generate), subscribe to `comments` + `messages`/`messaging_postbacks` fields.
2. Submit App Review for advanced access: `instagram_business_manage_comments`, `instagram_business_manage_messages` (screencast of working dev-mode flow after Phase 1).
3. Launch gates on approval; dev mode suffices for all development and testing.

## 9. Build order (~2.5 weeks total)

- **Phase 1 — core loop (~6d backend, ~2d app):** webhook receiver + signature verify, graph client, keyword matcher, job queue + rate limiter, direct-DM + public reply, automations CRUD + logs, Automate tab (list/builder/detail), token encryption + migration.
- **Phase 2 — growth features (~3d backend, ~2d app):** button-DM + postback flow, tracked links + CTR, campaign templates, stats dashboard, token-refresh cron.
- **Phase 3 — hardening (~2d backend):** polling reconciler, next-reel auto-attach, webhook event log, worker health.

## 10. Risks

| Risk | Mitigation |
|---|---|
| App Review rejected/delayed | Build fully testable in dev mode; screencast shows real flow; scope descriptions copied from working competitors' approved apps |
| Webhook misses comments | Phase 3 reconciler (72h lookback, openreply-proven pattern) |
| 750/hr cap hit on viral posts | Rate limiter requeues with backoff; logs surface delays honestly |
| Token expiry breaks automations | Refresh cron (10d lead) + `status=error` + in-app reconnect CTA |
| Spam reports from auto-DMs | One DM per commenter per automation (dedup), 7-day window, `{username}` personalization, no repeated messaging |
