# FastAPI to Gin Inventory

## Purpose

This document freezes the current `api/` behavior so the Go/Gin migration can
match the existing mobile and backend contracts intentionally.

## Server Entry Points

- `api/main.py`
  - Creates the `FastAPI` app
  - Loads `api/.env`
  - Registers CORS middleware, request ID middleware, HTTP exception handling,
    lifespan startup/shutdown, and top-level routes
  - Includes routers from `api/routes/*.py`
- `api/run.py`
  - Dev entrypoint for `uvicorn`

## Auth Modes

- Clerk Bearer JWT
  - Used by `POST /auth/appwrite-session`
  - Used by `POST /login`
  - Used by `GET /profile`
  - Used by `GET /media`
  - Used by `GET /insights`
  - Used by `POST /disconnect`
  - Used by most `/automations` routes
- Appwrite user JWT
  - Used by the Expo client against the ig proxy contract in `src/lib/instagram.ts`
  - Go migration must preserve the current `401 -> session_expired` behavior
- Cron shared secret
  - Header: `X-Cron-Secret`
  - Used by `/cron/*`
- Meta webhook HMAC
  - Header: `x-hub-signature-256`
  - Used by `POST /webhooks/instagram`
- No auth
  - `GET /health`
  - `GET /automations/templates`
  - `GET /instagram/callback`
  - `GET /webhooks/instagram`
  - `GET /r/{slug}`

## Middleware, Exceptions, and Lifecycle

- CORS
  - Source: `CORS_ORIGINS`
  - `allow_origins` is env-driven
  - `allow_credentials=False`
  - `allow_methods=["*"]`
  - `allow_headers=["*"]`
- Request ID middleware
  - Reads `X-Request-ID` if present
  - Otherwise generates an 8-char UUID fragment
  - Always writes `X-Request-ID` in the response
- HTTP exception handler
  - If `exc.detail` is a dict, it returns that dict directly
  - Otherwise it wraps as `{"detail": ...}`
- Lifespan startup/shutdown
  - Starts `sweeper_loop(get_automation_store())` when
    `AUTOMATION_SWEEPER_ENABLED=true`
  - On shutdown logs out all active Instagram sessions

## Route Inventory

| Route | Method | Auth | Request | Success | Error Shape | Side Effects |
| --- | --- | --- | --- | --- | --- | --- |
| `/health` | GET | none | none | `200 {"status":"ok"}` | default FastAPI or wrapper | none |
| `/auth/appwrite-session` | POST | Clerk Bearer | no JSON body | `200 {"userId":"...","secret":"..."}` | `502 {"error":"appwrite_session_failed","message":"..."}` | creates Appwrite session and starts async creator provisioning |
| `/login` | POST | Clerk Bearer | `{"clerk_id","username","password"}` | `200` login payload from `api/main.py` | `401 {"error":"clerk_id_mismatch"}` or `401 {"error":"invalid_credentials","message":"..."}` and other session/login errors | creates or rehydrates Instagram session, writes creator/appwrite state |
| `/profile` | GET | Clerk Bearer | none | `200` profile payload | `401 {"error":"session_expired","message":"..."}` or `401 {"error":"not_connected","message":"..."}` | may rehydrate session from stored data |
| `/media` | GET | Clerk Bearer | query `amount`, default `25` | `200` media payload | same session-related errors as `/profile` | none |
| `/insights` | GET | Clerk Bearer | none | `200` insights payload | same session-related errors as `/profile` | none |
| `/disconnect` | POST | Clerk Bearer | none | `200` success payload | auth/session errors | clears local session and Appwrite creator connection fields |
| `/automations` | GET | Clerk Bearer | none | `200 {"automations":[...]}` | `401 {"error":"unauthorized","message":"Missing Authorization header"}` | none |
| `/automations` | POST | Clerk Bearer | automation create body | `201 {"automation":{...}}` | `422 {"error":"validation","message":"..."}`, `409 {"error":"instagram_not_connected","message":"..."}` | creates automation, may create tracked-link slug |
| `/automations/templates` | GET | none | none | `200 {"templates":[...]}` | default FastAPI | none |
| `/automations/stats/overview` | GET | Clerk Bearer | none | `200 {"sent_7d","clicks_7d","ctr_7d","top_keyword_7d","active_automations"}` | auth errors | reads logs, tracked links, clicks |
| `/automations/{automation_id}` | GET | Clerk Bearer | path param | `200 {"automation":{...}}` | `404 {"error":"not_found","message":"Automation not found"}` | ownership check |
| `/automations/{automation_id}` | PATCH | Clerk Bearer | partial automation patch | `200 {"automation":{...}}` | `404 {"error":"not_found","message":"Automation not found"}` and validation errors | updates automation |
| `/automations/{automation_id}` | DELETE | Clerk Bearer | path param | `204` no body | `404 {"error":"not_found","message":"Automation not found"}` | deletes automation |
| `/automations/{automation_id}/logs` | GET | Clerk Bearer | path param | `200 {"logs":[...]}` | `404 {"error":"not_found","message":"Automation not found"}` | ownership check |
| `/automations/{automation_id}/stats` | GET | Clerk Bearer | path param | `200 {"sent","skipped","failed","clicks","ctr","top_keywords","daily"}` | `404 {"error":"not_found","message":"Automation not found"}` | aggregates logs and clicks |
| `/cron/refresh-tokens` | POST | `X-Cron-Secret` | none | `200 {"refreshed":n,"failed":n}` | `401` empty body | refreshes expiring Instagram tokens |
| `/cron/reconcile` | POST | `X-Cron-Secret` | none | `200` reconcile payload plus `attached` | `401` empty body | polls for unmatched comments and attaches next reels |
| `/cron/retain-logs` | POST | `X-Cron-Secret` | none | `200 {"deleted_logs":n,"deleted_webhook_events":n}` | `401` empty body | deletes old automation logs and webhook events |
| `/cron/health` | GET | `X-Cron-Secret` | none | `200 {"pending","processing","failed","done","last_webhook_event_at"}` | `401` empty body | none |
| `/instagram/callback` | GET | none | query `code`, `state`, error params | `200` HTML success/error page with app redirect | HTML error page, OAuth/network failures | exchanges tokens, fetches profile, stores creator data, attempts webhook subscription |
| `/webhooks/instagram` | GET | none | query `hub.mode`, `hub.verify_token`, `hub.challenge` | plain-text challenge body | `403` empty body | none |
| `/webhooks/instagram` | POST | HMAC signature | raw JSON body | `200 {"status":"ok"}` after valid signature | `401` empty body on bad signature | records raw payload, parses comment/postback events, creates jobs, enqueues worker tasks |
| `/r/{slug}` | GET | none | path param | `302` redirect to target URL | `404 {"error":"not_found","message":"Tracked link not found"}` | records click before redirect |

## Automation Contract Details

### Request validation

- `target_type` must match `all_posts|specific_posts|next_reel`
- `match_mode` must match `whole_word|partial`
- `opening_dm_mode` must match `direct|button`
- `button_text` is required when `opening_dm_mode == "button"`
- `reveal_message` is required when `opening_dm_mode == "button"`
- `media_ids` is required when `target_type == "specific_posts"`
- `public_reply_message` is required when `public_reply_enabled == true`
- `keywords` must contain at least one non-empty trimmed string

### Ownership rules

- All automation reads/writes verify `row["clerk_user_id"] == clerk_user_id`
- Mismatches intentionally return `404`, not `403`

### Response wrappers

- `GET /automations` -> `{"automations":[...]}`
- `POST /automations` -> `{"automation":{...}}`
- `GET /automations/{id}` -> `{"automation":{...}}`
- `PATCH /automations/{id}` -> `{"automation":{...}}`
- `GET /automations/{id}/logs` -> `{"logs":[...]}`
- `GET /automations/templates` -> `{"templates":[...]}`
- `DELETE /automations/{id}` -> `204 No Content`
- Stats routes return bare objects, not wrapped payloads

## Webhook and Worker Contract

- Valid webhook signatures must always return `200 {"status":"ok"}` even if
  payload parsing, raw payload storage, or job enqueue work logs warnings
- Raw payloads are recorded when possible but never fail the request
- Comment events create `process_comment` jobs
- Postback `payload.startswith("reveal:")` creates `send_reveal` jobs
- FastAPI currently uses `BackgroundTasks` plus a sweeper loop to ensure work
  is eventually processed

## OAuth Callback Contract

- Route: `GET /instagram/callback`
- No Clerk JWT on the request
- Reads and trusts `state` to recover the Clerk user context
- Returns HTML, not JSON
- Success page redirects to `?status=success`
- Error page redirects to `?status=error&message=...`
- The Expo deep-link flow depends on those exact query parameters

## Expo-Critical Client Contracts

### `src/lib/auth-bridge.ts`

- Calls `POST ${EXPO_PUBLIC_IG_API_BASE_URL}/auth/appwrite-session`
- Header: `Authorization: Bearer <Clerk JWT>`
- Requires success body `{ userId, secret }`
- On non-2xx, attempts to read `.message` from JSON and then collapses to
  `Error("bridge_failed")`

### `src/lib/automations.ts`

- Uses `EXPO_PUBLIC_IG_API_BASE_URL`
- Sends Clerk Bearer auth
- Treats missing token as `session_expired`
- Treats `401` as `session_expired`
- Expects wrapped bodies for list/create/update/logs/templates routes
- Expects raw object bodies for stats routes
- Throws `automations request failed (<status>): <body>` for non-401 errors
- UI special-cases `409` and `instagram_not_connected`

### `src/lib/instagram.ts`

- Uses `EXPO_PUBLIC_IG_API_PROXY_URL`
- Sends `x-appwrite-user-jwt`
- Expects response body shape `{ "success": true, "data": ... }`
- Maps `401` to `session_expired`
- `/profile`, `/media`, `/insights`, `/disconnect` must stay behaviorally
  compatible even if the new Go service owns them directly

## Environment Inventory

- `CLERK_SECRET_KEY`
- `CLERK_JWT_KEY`
- `CLERK_AUTHORIZED_PARTIES`
- `CORS_ORIGINS`
- `APPWRITE_ENDPOINT`
- `APPWRITE_PROJECT_ID`
- `APPWRITE_API_KEY`
- `APPWRITE_DATABASE_ID`
- `APPWRITE_CREATORS_TABLE_ID`
- `APPWRITE_AUTOMATIONS_TABLE_ID`
- `APPWRITE_AUTOMATION_LOGS_TABLE_ID`
- `APPWRITE_AUTOMATION_JOBS_TABLE_ID`
- `APPWRITE_TRACKED_LINKS_TABLE_ID`
- `APPWRITE_LINK_CLICKS_TABLE_ID`
- `APPWRITE_WEBHOOK_EVENTS_TABLE_ID`
- `IG_API_PORT`
- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `REDIRECT_URI`
- `WEBHOOK_VERIFY_TOKEN`
- `TOKEN_ENCRYPTION_KEY`
- `FACEBOOK_APP_SECRET`
- `CRON_SECRET`
- `PUBLIC_BASE_URL`
- `AUTOMATION_SWEEPER_ENABLED`

## Python-Specific Behaviors The Go Port Must Replace

- `Depends(...)` based auth extraction in handlers
- `run_in_threadpool(...)` around sync Appwrite store access
- `BackgroundTasks` webhook fan-out
- `asyncio.create_task(...)` sweeper startup
- Python thread for `_ensure_creator_profile`
- Process-local session registry and file-backed session persistence in
  `api/session_manager.py`

## Migration Notes

- Treat FastAPI as the reference behavior, not the target architecture
- Preserve external response shape first, then optimize internals
- Preserve `404` ownership masking and `401 -> session_expired` behavior
- Preserve redirect, webhook, and OAuth completion semantics exactly
