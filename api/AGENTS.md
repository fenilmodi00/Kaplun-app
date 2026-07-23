# api/ — FastAPI Creator Dashboard Backend

Standalone FastAPI backend for the Instagram creator dashboard MVP. Serves the `app/` Expo frontend. Does NOT wrap `crew.py` or invoke agents — it shares only `ig_client.py` (`InstagramClient`) and loguru with the agent pipeline.

## ROUTES (`main.py`)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | — | `{"status": "ok"}` |
| POST | `/login` | Clerk JWT | Instagram login; stores profile in Appwrite |
| GET | `/profile` | Clerk JWT | Authenticated user's IG profile |
| GET | `/media?amount=1-100` | Clerk JWT | User's recent media |
| GET | `/insights` | Clerk JWT | Account insights (business accounts only) |
| POST | `/disconnect` | Clerk JWT | Logout + clear Appwrite session fields |

## MODULES

| File | Role |
|------|------|
| `auth.py` | Clerk JWT (HS256) verification via PyJWT; `get_clerk_user_id()` FastAPI dep |
| `session_manager.py` | Per-Clerk-user `InstagramClient` registry; LRU eviction at 50 sessions; session files at `data/sessions/{clerk_user_id}.json` |
| `appwrite_client.py` | Appwrite Server SDK singleton; upserts/clears creator profiles in the `creators` table (`vernacular_saas` DB) |
| `run.py` | Uvicorn launcher — `uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)`; adds repo root to `sys.path` |

## CONVENTIONS

- **Every route except `/health` requires Clerk JWT** — `Authorization: Bearer <token>` through the `require_clerk_user_id` dependency.
- **Error shape**: `HTTPException.detail` may be a dict (`{"error": ..., "message": ...}`); the exception handler passes dicts through unwrapped. Instagrapi mapping: BadPassword/2FA → 401, rate limits → 429, other ClientError → 502, expired session → 401 `session_expired`.
- **Request IDs**: middleware attaches `X-Request-ID` (8-char uuid) to every response for log correlation.
- **CORS**: `CORS_ORIGINS` env, comma-separated, defaults to `*` (MVP dev).
- **Env**: own `api/.env` (see `api/.env.example`): `CLERK_SECRET_KEY`, `APPWRITE_*` endpoint/project/DB/table IDs, `IG_API_PORT`.
- **Tests**: `tests/test_api_infrastructure.py` + `tests/test_api_endpoints.py` — `TestClient` + `monkeypatch` env + mocked JWT/IG/Appwrite.

## ANTI-PATTERNS

- **No CrewAI/agent imports** — this backend is agent-free by design.
- **No shared global InstagramClient** — always `SessionManager.get(clerk_user_id)`; the pipeline's `get_ig_client()` singleton is for CLI runs, not per-user API traffic.
- **No storing IG passwords** — credentials live only for the login call; sessions persist via instagrapi session files.

## COMMANDS

```bash
pip install -r api/requirements.txt
python api/run.py        # http://localhost:8000 (reload)
```
