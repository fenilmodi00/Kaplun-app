# Expo ↔ Gin contract verification

Date: 2026-07-30  
Worktree: `.worktrees/fastapi-gin-migration`

## Verdict

**No Expo TypeScript changes are required** for the Gin cutover if `EXPO_PUBLIC_IG_API_BASE_URL` points at the Go server and contracts below stay intact.

## Client surfaces

| Client file | Backend | Gin status |
|-------------|---------|------------|
| `src/lib/auth-bridge.ts` | `POST /auth/appwrite-session` → `{ userId, secret }` | Implemented; Clerk Bearer |
| `src/lib/automations.ts` | `/automations/*` wrappers, `204` delete, `401`→`session_expired` | Implemented |
| `src/lib/instagram.ts` | `EXPO_PUBLIC_IG_API_PROXY_URL` + Appwrite JWT envelope `{success,data}` | **Not Gin** — still Appwrite cloud function unless separately migrated |
| `src/lib/instagram-oauth.ts` | Deep link `?status=success\|error` | Gin OAuth HTML callback preserves query contract |
| `src/lib/with-fresh-session.ts` | Relies on `session_expired` / bridge | Unchanged |

## Explicit non-changes

- Do not rewrite automations client for Gin error JSON; status codes + body substrings (`409`, `instagram_not_connected`) already match.
- Do not change AuthGate / `ensureAppwriteSession` unless bridge response shape drifts.
- Keep `EXPO_PUBLIC_IG_API_PROXY_URL` on the existing proxy for profile/media/insights/disconnect in the Expo app. Gin also exposes Clerk-authed `/profile|/media|/insights|/disconnect` for FastAPI parity (password-login path), which is a different auth model than the Expo proxy client.

## Staging check list (manual)

1. Set `EXPO_PUBLIC_IG_API_BASE_URL` to Gin staging URL; restart Expo.
2. Sign in → AuthGate bridge succeeds (no soft Retry banner).
3. Open Automate tab → list/templates/overview load.
4. Create automation → `201` and row appears; toggle/delete works.
5. Instagram OAuth connect → deep link `status=success`.
6. Confirm Appwrite creator row still readable via repository hooks.

## Tests to keep green on app side

```bash
npx jest src/__tests__/automations-client.test.ts src/__tests__/auth-gate.test.tsx src/__tests__/instagram.test.ts --runInBand
```

Note: full `jest` suite on this branch already has pre-existing failures unrelated to Gin (`profile`, `messages`, `thread-detail` loading-copy tests).
