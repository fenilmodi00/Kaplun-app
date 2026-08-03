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
- `internal/middleware` — RequestID, Recovery, CORS, Clerk auth, `X-Cron-Secret`
- `internal/handlers` — HTTP handlers per domain (bridge, automations, webhooks, cron, instagram_oauth, instagram_auth, instagram_proxy, tracked_links)
- `internal/services` — business logic (bridge, session, automations, oauth, reconcile, trackedlinks, templates, keywords, ratelimit, tracking)
- `internal/store` — Appwrite persistence (automations, jobs, logs, links, clicks, reconcile)
- `internal/platform` — external clients: `appwrite`, `clerk` (JWT verify), `meta` (Graph API + webhook HMAC), `crypto` (token encryption), `cloudflare`/`ngrok` (tunnels)
- `internal/worker` — job pool, sweeper, comment_runner (process_comment / send_reveal jobs)
- `internal/models` — request/response types; `ErrorResponse{error, message}` is the standard error shape

## CONVENTIONS

- **Nil-dependency route skipping** — `router.Dependencies` fields are optional; nil means the route group is not registered, so `/health` still answers when secrets are missing. Keep this pattern when adding routes.
- **Env loading** — `main.go` loads `api-go/.env` via godotenv before `config.Load()`; process env vars override `.env`.
- **Cloudflare quick tunnel on by default** — logs the public URL + OAuth/webhook paths a few seconds after listen. Quick tunnels get a NEW `*.trycloudflare.com` host each restart: update Meta redirect URIs, `REDIRECT_URI`, and the app's `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI`. Disable with `CLOUDFLARE_TUNNEL_ENABLED=false`. Needs `cloudflared` on PATH (or `tools/cloudflared.exe`).
- **Auth modes** — Clerk Bearer (app calls), `X-Cron-Secret` (`/cron/*`), Meta HMAC `x-hub-signature-256` (`POST /webhooks/instagram`), none (`/health`, `/r/:slug`, `/instagram/callback`, `GET /webhooks/instagram`).
- **Contract preservation** — ownership mismatches return `404` (not 403); expired sessions return `401 {"error":"session_expired"}`; automation list/detail responses are wrapped (`{"automation":{...}}`), stats are bare objects; valid webhooks always return `200 {"status":"ok"}` even when processing fails.
- **Instagram login** — `POST /login` uses `github.com/felipeinf/instago` (Go instagrapi equivalent) via `services/session` (LRU + persistence). This is server-side only; the app-side "no instagrapi" rule still stands.
- **Logging** — `log/slog` JSON to stdout; pass `*slog.Logger` down, don't use `log.Println`.

## TESTS

- `go test ./...` — colocated `*_test.go`; httptest-based handler tests, table-driven services. No external services required (Appwrite/Meta clients are interfaced + faked).
- `internal/handlers/automations_test.go` (~430 lines) and `worker/comment_runner_test.go` (~440) are the pattern references.

## GOTCHAS

- `server.exe` / `tools/*.log` are gitignored build/runtime artifacts — don't commit.
- Token encryption key is `TOKEN_ENCRYPTION_KEY`; tokens at rest are encrypted in `platform/crypto`.
- `AUTOMATION_SWEEPER_ENABLED=true` starts the sweeper loop that retries pending jobs — required for comment automations to actually send. The same flag also starts the in-process reconcile poller (`startReconcileLoop`), the safety net for comments webhooks miss — no external scheduler needed.
