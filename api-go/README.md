# api-go — Gin backend (FastAPI replacement)

Go/Gin port of `api/` FastAPI. External contracts match the Expo app and Meta webhooks.

## Run

```bash
cd api-go
cp .env.example .env   # fill secrets (same names as api/.env)
go run ./cmd/server
```

Default listen: `:8000` (`IG_API_PORT`).

## Test

```bash
go test ./...
```

## Route groups

| Path | Auth |
|------|------|
| `GET /health` | none |
| `POST /auth/appwrite-session` | Clerk Bearer |
| `POST /login`, `GET /profile\|media\|insights`, `POST /disconnect` | Clerk Bearer |
| `/automations/*` | Clerk Bearer (templates unauthenticated) |
| `GET /r/:slug` | none |
| `GET\|POST /webhooks/instagram` | Meta verify / HMAC |
| `/cron/*` | `X-Cron-Secret` |
| `GET /instagram/callback` | none (OAuth redirect) |

## Expo env

Point the Clerk-authenticated base URL at this server:

```
EXPO_PUBLIC_IG_API_BASE_URL=http://localhost:8000
```

Leave `EXPO_PUBLIC_IG_API_PROXY_URL` on the Appwrite ig-api-proxy unless you intentionally unify Instagram proxy auth onto Gin (Expo currently sends `x-appwrite-user-jwt` and expects `{ success, data }`).

See `docs/fastapi-to-gin-inventory.md` and `docs/plans/2026-07-30-fastapi-to-gin-cutover.md`.
