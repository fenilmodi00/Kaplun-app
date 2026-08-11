# api-go/ — Gin Backend

Go/Gin replacement for the removed FastAPI `api/`. External contracts (routes, error shapes, auth) must match what the Expo app and Meta webhooks expect — the frozen reference is `../docs/fastapi-to-gin-inventory.md`. Module path: `kaplun/api-go`.

## COMMANDS

```bash
cp .env.example .env     # first run; fill secrets
go run ./cmd/server      # dev server on :8000 (IG_API_PORT); cold build 30-60s with no logs
go build -o server.exe ./cmd/server && ./server.exe   # faster re-runs
go test ./...            # all tests
go test ./internal/services/automations  # one package
```

## STRUCTURE

- `cmd/server/main.go` + `adapters.go` — entry: `loadDotEnv()` → `config.Load()` → `buildDependencies()` → `router.New()` → listen immediately, tunnels in background; adapters wire concrete services to handler/worker interface ports
- `internal/router` — Gin engine, route registration
- `internal/middleware` — RequestID, Recovery, CORS, Appwrite JWT auth, `X-Cron-Secret`
- `internal/handlers` — HTTP handlers per domain (bridge, automations, webhooks, cron, instagram_oauth)
- `internal/services` — business logic (automations, insights, keywords, oauth, ratelimit, reconcile, templates). There is NO `bridge` package — the auth bridge is `handlers/ensure_profile.go` + `platform/appwrite` client methods
- `internal/store` — Appwrite persistence (automations, jobs, logs, reconcile, insights)
- `internal/platform` — external clients: `appwrite` (TablesDB REST + profile bootstrap), `meta` (Graph API client + DM sender), `webhooks` (HMAC `x-hub-signature-256` verify + event parsers), `cloudflare` (tunnel). There is NO `clerk` package — Appwrite JWTs are verified by calling Appwrite `/account`
- `internal/worker` — job pool, sweeper, comment_runner (4 job types: `process_comment`, `send_reveal`, `send_followup`, `process_message`)

## ROUTES

Registered conditionally on non-nil `router.Dependencies`; `/health` always answers.

| Method | Path | Auth |
|--------|------|------|
| GET | `/health` | none |
| POST | `/auth/ensure-profile` | Appwrite JWT Bearer |
| GET | `/automations/templates` | **none** (registered before the authed group — static presets) |
| GET/POST | `/automations`, `/automations/stats/overview` | Appwrite JWT Bearer |
| GET/PATCH/DELETE | `/automations/:id` | Appwrite JWT Bearer |
| GET | `/automations/:id/logs`, `/automations/:id/stats` | Appwrite JWT Bearer |
| GET | `/webhooks/instagram` | none (`verify_token` query) |
| POST | `/webhooks/instagram` | Meta HMAC `x-hub-signature-256` |
| POST | `/cron/refresh-tokens`, `/cron/reconcile`, `/cron/retain-logs`, `/cron/sync-insights` | `X-Cron-Secret` |
| GET | `/cron/health` | `X-Cron-Secret` |
| GET | `/instagram/callback` | none |

## IN-PROCESS LOOPS

All started from `buildDependencies` (`cmd/server/adapters.go`); no external scheduler.

| Loop | Env gate | Interval | Role |
|------|----------|----------|------|
| Worker pool + sweeper | `AUTOMATION_SWEEPER_ENABLED` (default true) | `SWEEPER_INTERVAL_MS` (default 60000 = 1 min) | Retry due/stale automation jobs. Pool size: `WORKER_POOL_SIZE` (default 4), queue: `WORKER_QUEUE_SIZE` (default 64) |
| Reconcile poller | `AUTOMATION_SWEEPER_ENABLED` | `COMMENT_POLL_INTERVAL_MS` (default 5 min) | `ReconcileOnce` + `ReconcilePostbacksOnce` + `AttachNextReels` — catches comments/postbacks webhooks miss |
| Token refresh | `AUTOMATION_SWEEPER_ENABLED` (same loop ctx) | 24h (first tick 1 min after boot) | Refresh creator long-lived tokens expiring within 10 days |
| Insights sync | `INSIGHTS_SYNC_ENABLED` (default false) | boot backfill + 24h sweep | First-party insights: media, insight days, demographics, online followers, mentioned media |

Cleanup is LIFO: `sweeper.Stop` → pool cancel → `pool.Shutdown`.
- `internal/models` — request/response types; `ErrorResponse{error, message}` is the standard error shape

## CONVENTIONS

- **Nil-dependency route skipping** — `router.Dependencies` fields are optional; nil means the route group is not registered, so `/health` still answers when secrets are missing. Keep this pattern when adding routes.
- **Env loading** — `main.go` loads `api-go/.env` via godotenv before `config.Load()`; process env vars override `.env`.
- **Cloudflare quick tunnel on by default** — logs the public URL + OAuth/webhook paths a few seconds after listen. Quick tunnels get a NEW `*.trycloudflare.com` host each restart: update Meta redirect URIs, `REDIRECT_URI`, and the app's `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI`. Disable with `CLOUDFLARE_TUNNEL_ENABLED=false`. Needs `cloudflared` on PATH (or `tools/cloudflared.exe`).
- **Auth modes** — Appwrite JWT Bearer (app calls), `X-Cron-Secret` (`/cron/*`), Meta HMAC `x-hub-signature-256` (`POST /webhooks/instagram`), none (`/health`, `/instagram/callback`, `GET /webhooks/instagram`).
- **Contract preservation** — ownership mismatches return `404` (not 403); expired sessions return `401 {"error":"session_expired"}`; automation list/detail responses are wrapped (`{"automation":{...}}`), stats are bare objects; valid webhooks always return `200 {"status":"ok"}` even when processing fails.
- **Instagram auth** — The app uses the official Meta Graph API for all Instagram operations. Instagram OAuth (`GET /instagram/callback`) exchanges codes for long-lived tokens via `services/oauth`. The old instagrapi-based `POST /login`, `GET /profile|/media|/insights`, and `POST /disconnect` endpoints have been removed.
- **Logging** — `log/slog` JSON to stdout; pass `*slog.Logger` down, don't use `log.Println`.

## TESTS

- `go test ./...` — colocated `*_test.go`; httptest-based handler tests, table-driven services. No external services required (Appwrite/Meta clients are interfaced + faked).
- `internal/handlers/automations_test.go` (~430 lines) and `worker/comment_runner_test.go` (~440) are the pattern references.

## GOTCHAS

- `server.exe` / `tools/*.log` are gitignored build/runtime artifacts — don't commit.
- Creator tokens are stored **plaintext by design** — the Expo app reads `access_token` directly and calls graph.instagram.com (see `plaintextTokenDecryptor` in `cmd/server/adapters.go`).
- `AUTOMATION_SWEEPER_ENABLED=true` starts the sweeper loop that retries pending jobs — required for comment automations to actually send. The same flag also starts the in-process reconcile poller (`startReconcileLoop`) and the daily token-refresh loop — no external scheduler needed.
- Never write `ig_session_json` to the creators table — the column does not exist (enforced in `oauth/service_test.go`).
- `store/insights_store.go` per-media upserts must not zero out previously stored metrics when a newer fetch lacks them.
- `APPWRITE_JWT_KEY` is not read anywhere; JWT verification calls Appwrite `/account` with endpoint + project ID. Do not add it to `.env.example` — there is no server-side JWT signing key.
