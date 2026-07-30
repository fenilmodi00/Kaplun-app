# FastAPI → Gin cutover checklist

Date: 2026-07-30

## Pre-cutover

- [ ] `go test ./...` green in `api-go/`
- [ ] `go build ./cmd/server` green
- [ ] Staging Gin deployed with production-like env (same Appwrite project, Clerk, Meta secrets)
- [ ] Expo pointed at staging Gin via `EXPO_PUBLIC_IG_API_BASE_URL`
- [ ] Manual matrix from `docs/plans/2026-07-30-fastapi-to-gin-expo-verification.md` passed
- [ ] Webhook: Meta test send hits Gin `POST /webhooks/instagram` → `200 {"status":"ok"}` and job rows appear
- [ ] Cron: `POST /cron/refresh-tokens` and `GET /cron/health` with `X-Cron-Secret` succeed
- [ ] Tracked link: `GET /r/{slug}` redirects and records click
- [ ] Freeze Python `api/` deploys during final window

## Cutover

1. Deploy Gin to production API host (or swap load balancer target).
2. Update Expo production env `EXPO_PUBLIC_IG_API_BASE_URL` to Gin URL.
3. Update Meta webhook callback URL / cron scheduler to Gin host if not same hostname.
4. Monitor for 30–60 minutes:
   - bridge failures / AuthGate Retry
   - webhook success rate and job backlog (`/cron/health`)
   - automation create/list errors
5. Keep Python binary offline but not deleted until rollback window ends (recommended 24–72h).

## Rollback

1. Point DNS / LB / `EXPO_PUBLIC_IG_API_BASE_URL` back to FastAPI.
2. Re-enable Python sweeper (`AUTOMATION_SWEEPER_ENABLED=true`).
3. Confirm Meta webhook + cron hit Python again.

## Post-cutover cleanup (after rollback window)

- Archive or remove FastAPI runtime (`api/main.py`, `api/run.py`, route modules) once Gin is stable.
- Update root `AGENTS.md` / `api/AGENTS.md` to describe Gin as the API server.
- Keep `docs/fastapi-to-gin-inventory.md` as historical contract reference.

## Known deferred items

- Cron **reconcile** path not fully wired (needs Graph media/comments adapters).
- Expo Instagram **proxy** path (`EXPO_PUBLIC_IG_API_PROXY_URL`) is separate from Gin Clerk routes; unifying that envelope/auth is a follow-up.
- Instago has no account insights API; Gin `/insights` may return `insights_unavailable` for private-API sessions.
