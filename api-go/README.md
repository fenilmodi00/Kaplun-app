# api-go — Gin backend

Go/Gin backend for Kaplun. External contracts match the Expo app and Meta webhooks. (The old FastAPI `api/` has been removed.)

## Run

```bash
cd api-go
cp .env.example .env   # fill secrets
go run ./cmd/server
```

`cmd/server` loads `api-go/.env` automatically. Process env vars override `.env`.

By default it also starts a **Cloudflare Tunnel** (`cloudflared`) to `IG_API_PORT` in the background. This project uses named tunnel `kaplun-api` (`https://api-dev.kaplun.tech`) with ingress `http://127.0.0.1:8001`. The HTTP server listens immediately; tunnel readiness is logged a few seconds later with the public URL, OAuth callback, and webhook paths.

Requires the `cloudflared` CLI on PATH (or `api-go/tools/cloudflared.exe`). Disable with `CLOUDFLARE_TUNNEL_ENABLED=false` once the API is deployed.

Named tunnel (stable hostname after `cloudflared tunnel create` + `route dns`): set `CLOUDFLARE_TUNNEL_NAME=kaplun-api` + `CLOUDFLARE_TUNNEL_URL=https://api-dev.kaplun.tech` — uses `~/.cloudflared/<uuid>.json`, no token needed. Zero Trust dashboard path: `CLOUDFLARE_TUNNEL_TOKEN` + `CLOUDFLARE_TUNNEL_URL`. Empty name+token = ephemeral `*.trycloudflare.com` quick tunnel.

`IG_API_PORT` defaults to `8000` in code. This project's live `.env` is `8001`. You should see `"msg":"loaded env file"`, then `"msg":"server listening"`, then `"msg":"tunnel public URL"`.

**Important:** prefer the named tunnel. Quick tunnels get a new `*.trycloudflare.com` host each restart — update Meta OAuth redirect URI, webhook callback URL, and `REDIRECT_URI` / `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` if you fall back to a quick tunnel.

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
| `/automations/*` | Appwrite JWT Bearer (templates unauthenticated) |
| `GET\|POST /webhooks/instagram` | Meta verify / HMAC (`FACEBOOK_APP_SECRET`) |
| `/cron/*` | `X-Cron-Secret` |
| `GET /instagram/callback` | none (OAuth redirect) |

## Expo env

Point the Appwrite-authenticated base URL at this server:

```
EXPO_PUBLIC_IG_API_BASE_URL=https://api-dev.kaplun.tech
```

Local emulator against this project's live port: `http://localhost:8001` (or `http://10.0.2.2:8001` on Android). Leave `EXPO_PUBLIC_IG_API_PROXY_URL` unset — the app calls Instagram directly via `graph.instagram.com`.
