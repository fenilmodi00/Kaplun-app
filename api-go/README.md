# api-go — Gin backend (FastAPI replacement)

Go/Gin port of `api/` FastAPI. External contracts match the Expo app and Meta webhooks.

## Run

```bash
cd api-go
cp .env.example .env   # fill secrets (same names as api/.env)
go run ./cmd/server
```

`cmd/server` loads `api-go/.env` automatically (like FastAPI's dotenv). Process env vars override `.env`.

By default it also starts a **Cloudflare quick Tunnel** (`cloudflared`) to `IG_API_PORT` in the background. Free Cloudflare tunnels do **not** show the browser interstitial that breaks Meta webhook verification (unlike free ngrok). The HTTP server listens immediately; tunnel readiness is logged a few seconds later with the public URL, OAuth callback, and webhook paths.

Requires the `cloudflared` CLI on PATH (or `api-go/tools/cloudflared.exe`). Disable with `CLOUDFLARE_TUNNEL_ENABLED=false` once the API is deployed.

Named tunnel (stable hostname after `cloudflared tunnel create` + `route dns`): set `CLOUDFLARE_TUNNEL_NAME` + `CLOUDFLARE_TUNNEL_URL` — uses `~/.cloudflared/<uuid>.json`, no token needed. Zero Trust dashboard path: `CLOUDFLARE_TUNNEL_TOKEN` + `CLOUDFLARE_TUNNEL_URL`. Empty name+token = ephemeral `*.trycloudflare.com` quick tunnel.

Default listen: `:8000` (`IG_API_PORT`). You should see `"msg":"loaded env file"`, then `"msg":"server listening"`, then `"msg":"cloudflare quick tunnel ready"` / `"tunnel public URL"`.

**Important:** quick tunnels get a new `*.trycloudflare.com` host each restart. Update Meta OAuth redirect URI, webhook callback URL, and `REDIRECT_URI` / `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` to match the logged URL (or use a named Cloudflare tunnel for a stable hostname).

Note: `go run ./cmd/server` compiles first — a cold build can take ~30–60s with no logs. Re-runs are much faster, or use `go build -o server.exe ./cmd/server && ./server.exe`.

## Test

```bash
go test ./...
```

## Route groups

| Path | Auth |
|------|------|
| `GET /health` | none |
| `POST /auth/ensure-profile` | Appwrite JWT Bearer |
| *(removed — instagrapi proxy endpoints deleted)* | |
| `/automations/*` | Appwrite JWT Bearer (templates unauthenticated) |
| `GET\|POST /webhooks/instagram` | Meta verify / HMAC |
| `/cron/*` | `X-Cron-Secret` |
| `GET /instagram/callback` | none (OAuth redirect) |

## Expo env

Point the Appwrite-authenticated base URL at this server:

```
EXPO_PUBLIC_IG_API_BASE_URL=http://localhost:8000
```

Leave `EXPO_PUBLIC_IG_API_PROXY_URL` on the Appwrite ig-api-proxy unless you intentionally unify Instagram proxy auth onto Gin (Expo currently sends `x-appwrite-user-jwt` and expects `{ success, data }`).

See `docs/fastapi-to-gin-inventory.md` and `docs/plans/2026-07-30-fastapi-to-gin-cutover.md`.
