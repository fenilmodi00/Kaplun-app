# PROJECT KNOWLEDGE BASE — Kaplun app

**Generated:** 2026-08-06
**Commit:** 59c2219
**Branch:** chore/graph-api-v26-migration

> Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo-specific code.

## OVERVIEW

Expo SDK 57 mobile app for Instagram creators. React Query + Appwrite TablesDB + Gin/Go backend (`api-go/`). Clay design system via Tailwind v4 + `react-native-css`. File-based routing with expo-router. Package manager is Bun.

The old FastAPI `api/` has been removed; `api-go/` is the current backend. Historical contracts live in `docs/fastapi-to-gin-inventory.md`.

- **Framework**: Expo SDK 57, React Native 0.86, React 19.2
- **Routing**: expo-router file-based (`src/app/`)
- **Data**: `@tanstack/react-query` → `@/lib/repository` (typed Appwrite TablesDB calls with retry/timeout)
- **Auth**: Clerk (`@clerk/expo`) → Gin `POST /auth/appwrite-session` → Appwrite session
- **Instagram**: App calls `graph.instagram.com` directly using the per-user long-lived token from the `creators` row. Token refresh on Meta error 190.
- **Styling**: NativeWind v5 + Tailwind CSS v4 + `react-native-css` (`useCssElement` bridge, not `styled()`)
- **Reanimated**: React Native Reanimated 4.5.0, imported only via `@/lib/reanimated-platform`. Web uses Metro aliases to no-op stubs (#8285).

## COMMANDS

```bash
bun install              # install deps (bun.lock is the lockfile)
bun start                # expo dev server
bun start --android      # dev + Android
bun start --ios          # dev + iOS
bun start --web          # dev + web
bun test                 # jest-expo (preset: jest-expo, setup: jest.setup.ts)
bun test -- --testPathPattern=instagram  # run one test / pattern
bun run lint             # tsc --noEmit (no ESLint/Prettier/Biome)
```

No CI workflows, no EAS config, no root README. Backend README is `api-go/README.md`.

## ARCHITECTURE

**3-system design**:
- App → **Appwrite TablesDB** (CRUD + Realtime) via `@/lib/repository`
- App → **`graph.instagram.com`** directly (per-user token from creators row, refresh on Meta 190) via `@/lib/instagram`
- App → **Gin `api-go`** (auth bridge + automations engine) via Clerk Bearer at `EXPO_PUBLIC_IG_API_BASE_URL`

```
Screen → Hook (useQuery/useMutation)
  → @/lib/repository (typed, executeWithRetryAndTimeout)
    → tablesDB (Appwrite TablesDB singleton)
      → Appwrite

Instagram operations:
  → @/lib/instagram (reads token from creators row)
    → graph.instagram.com directly (per-user long-lived token)
    → on Meta error 190: ig_refresh_token → updateCreatorToken() → retry once

Auth bridge (once per sign-in):
  Clerk getToken() → Gin /auth/appwrite-session → account.createSession()
  → ensureAppwriteSession() with 24h TTL fast path + exponential backoff retry
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a screen | `src/app/(tabs)/<group>/` | Each group has `_layout.tsx` (Stack) + `index.tsx` |
| Add an Appwrite query | `src/lib/repository.ts` | Wrap in `executeWithRetryAndTimeout`; use `DATABASE_ID` + `TABLES` |
| Add an Appwrite table ID | `src/lib/constants.ts` + `src/lib/types.ts` | Constants are hardcoded Appwrite IDs |
| Add a data hook | `src/hooks/` | Follow existing React Query + repository pattern |
| Add a backend API call | `src/lib/automations.ts` or `src/lib/auth-bridge.ts` | Clerk Bearer to `EXPO_PUBLIC_IG_API_BASE_URL` |
| Add an Instagram call | `src/lib/instagram.ts` | Direct Graph API; never add a proxy |
| Fix Reanimated web crash | `metro.config.js` + `src/lib/*-web-stub.js` | Issue #8285; web aliases reanimated/worklets |
| Debug startup crash | `src/lib/logger.tsx` → `SplashLogger` | In-memory ring buffer; renders on-screen |
| Run backend locally | `api-go/` | `cp .env.example .env && go run ./cmd/server` (defaults `:8000`) |

## CONVENTIONS

- **React Query** for all data: `useQuery` reads, `useMutation` writes, `invalidateQueries`/`setQueryData` for cache updates. Global defaults: `staleTime: 30_000`, `gcTime: 24h`, `retry: false`. Hooks override `gcTime` to 5 min.
- **Query persistence**: `PersistQueryClientProvider` dehydrates success-state queries to AsyncStorage for 24h (`PERSIST_BUSTER = '1'`). Stale-sensitive data must refetch on restore.
- **TablesDB, not Databases** — all Appwrite access is document-based via `TablesDB`.
- **Repository pattern** — all Appwrite queries go through typed functions in `@/lib/repository.ts`. Hooks never import `tablesDB` directly.
- **Instagram direct only** — every Instagram call goes through `@/lib/instagram.ts` → `graph.instagram.com`. No proxy, no instagrapi.
- **Auth bridge seam** — `EXPO_PUBLIC_IG_API_BASE_URL` used only by `auth-bridge.ts` and `automations.ts`, both with Clerk Bearer. After bridging, app talks to Appwrite directly.
- **Error conventions**: Instagram token missing → `throw new Error('session_expired')`. Auth bridge failure → `throw new Error('bridge_failed')`.
- **Reanimated imports** — always from `@/lib/reanimated-platform` or `@/tw/animated`. Never directly from `react-native-reanimated`.
- **`.web.tsx` variants** — components with Reanimated get a `.web.tsx` variant using plain RN; Metro resolves it on web.
- **Styling split** — most screens use `@/tw` primitives with Tailwind `className`. Raw-RN `StyleSheet.create()` reserved for ClayAnimatedButton, ClaySpinner, AuthScreen (Android layout bugs).
- **Path alias**: `@/*` → `./src/*`.
- **Logging**: use `addLog()` from `@/lib/logger` instead of `console.log`.
- **Package manager**: Bun. `expo install` excludes TypeScript (devDependency only).
- **`lightningcss` pinned to 1.30.1** in `package.json` `resolutions`.

## ANTI-PATTERNS

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives. Exceptions: `@/tw/*` internals, `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`, and the documented raw-RN Clay components.
- **NO `StyleSheet.create()` in screens** — use Tailwind `className`.
- **NO bare `catch {}`** — always name the error (`catch (err: unknown)`).
- **NO `as any` / `@ts-ignore` / `@ts-expect-error`** — prefer `unknown` + type guards.
- **NO `console.log`/`console.warn`** — use `addLog()` from `@/lib/logger`.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform` or `@/tw/animated`.
- **NO hardcoded secrets** — `EXPO_PUBLIC_*` env vars only in app code.
- **NO direct instagrapi / proxy** — Instagram calls go through `@/lib/instagram.ts`.
- **NO `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO `account.createSession()` outside `auth-bridge.ts`** — the auth bridge is the only session creator.
- **NO direct Fetch/AbortController in hooks** — use `executeWithRetry`, `executeWithTimeout`, or `executeWithRetryAndTimeout` from `@/lib/resilient`.

## ENV VARS

Required in app `.env` (see `.env.example`):

| Variable | Used In |
|----------|---------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `_layout.tsx` (ClerkProvider) |
| `EXPO_PUBLIC_APPWRITE_ENDPOINT` | `lib/appwrite.ts` |
| `EXPO_PUBLIC_APPWRITE_PROJECT_ID` | `lib/appwrite.ts` |
| `EXPO_PUBLIC_IG_API_BASE_URL` | `lib/auth-bridge.ts` + `lib/automations.ts` (Clerk Bearer) |
| `EXPO_PUBLIC_IG_APP_ID` | Instagram OAuth |
| `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` | Instagram OAuth |

`EXPO_PUBLIC_IG_API_PROXY_URL` in `.env.example` is **legacy/dead** — the old Appwrite ig-api-proxy is broken (Appwrite strips the reserved `x-appwrite-user-jwt` header). Do not wire new code to it.

## NOTES

- **Large-file hotspots** (prefer targeted edits over rewrites): `src/app/(tabs)/(automate)/new.tsx` (~1055), `AuthScreen.tsx` (~800), home/insights/profile screens (~625-650), `api-go/internal/worker/comment_runner.go` (~1247).
- **`jest.setup.ts` is 320 lines of global mocks** — check it before adding per-file mocks; `@clerk/expo` is already mocked via `__mocks__/@clerk/expo.ts`.
- **`EdgeBlur` is not a blur** — renders a plain `LinearGradient` canvas scrim; the real expo-blur layer crashed Android on screen transitions. The `blurTarget`/`intensity` props are kept only for call-site compatibility.
- **api-go in-process loops** — the sweeper (retries pending automation jobs) and the reconcile poller (catches comments webhooks miss) run inside the server process, both gated on `AUTOMATION_SWEEPER_ENABLED`; no external scheduler required.

<!-- BEGIN opencode-rag -->
## Code Navigation

ALWAYS use OpenCodeRAG tools before reading or editing:
- **Search first** — `search_semantic(query)` instead of grep/glob
- **Skeleton before read** — `get_file_skeleton(filePath)` then read specific lines
- **Usages before edit** — `find_usages(symbolName)` before modifying any symbol
- **Images via describe** — `describe_image(filePath)` — never read raw bytes

If no results, run `opencode-rag index`.
<!-- END opencode-rag -->

## Subdirectory Guides

- `api-go/AGENTS.md` — Gin/Go backend (routing, auth middleware, workers, tunnel, store layer)
- `src/lib/AGENTS.md` — infrastructure layer (Appwrite, repository, auth-bridge, Instagram, resilience, realtime)
- `src/hooks/AGENTS.md` — data layer (React Query hooks, repository.ts split)
- `src/components/clay/AGENTS.md` — Clay design system (`.web.tsx` variants, raw-RN exceptions)
- `src/tw/AGENTS.md` — styling primitives (`useCssElement` bridge, className-enabled RN wrappers)
