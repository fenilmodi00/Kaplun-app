# PROJECT KNOWLEDGE BASE — Kaplun app

**Generated:** 2026-08-03  
**Commit:** f78689a  
**Branch:** automate-dm-screen

> Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo-specific code.

## OVERVIEW

Expo SDK 57 mobile app for Instagram creators. React Query + Appwrite TablesDB + Gin/Go backend (`api-go/`). Clay design system via Tailwind v4 + `react-native-css`. File-based routing with expo-router. Package manager is Bun.

The old FastAPI `api/` has been removed; `api-go/` is the current backend. Historical contracts live in `docs/fastapi-to-gin-inventory.md` and `docs/plans/2026-07-30-fastapi-to-gin-cutover.md`.

## STACK

- **Framework**: Expo SDK 57, React Native 0.86, React 19.2
- **Routing**: expo-router file-based (`src/app/`)
- **Data**: `@tanstack/react-query` → `@/lib/repository` (typed Appwrite TablesDB calls with retry/timeout)
- **Auth**: Clerk (`@clerk/expo`) → Gin `POST /auth/appwrite-session` → Appwrite session
- **Instagram**: App calls `graph.instagram.com` directly using the per-user long-lived token from the `creators` row. Token refresh on Meta error 190.
- **Styling**: NativeWind v5 + Tailwind CSS v4 + `react-native-css` (`useCssElement` bridge, not `styled()`)
- **Reanimated**: React Native Reanimated 4.5.0, imported only via `@/lib/reanimated-platform`. Web uses Metro aliases to no-op stubs (#8285).

## STRUCTURE

- `src/app/` — 5 tab groups in tab-bar order `(home)`, `(automate)`, `(messages)`, `(insights)`, `(profile)`, plus root `_layout.tsx` and `(tabs)/_layout.tsx` (Tabs + `ClayTabBar` + top `EdgeBlur` scrim)
- `src/components/` — `auth/AuthScreen.tsx`, `clay/` design system, plus shared `screen-shell.tsx` (tab-bar clearance constants), `symbol-icon.tsx` (Ionicons/SF-symbol wrapper), `edge-blur.tsx` (gradient scrim)
- `src/hooks/` — 9 React Query hooks
- `src/lib/` — 21 infra files (appwrite, repository, query-client, auth-bridge, instagram, automations, realtime, resilience, etc.)
- `src/tw/` — 5 styling primitives (`className`-enabled RN wrappers)
- `src/__tests__/` — 19 jest-expo test files + `test-utils.ts`
- `src/global.css` — Tailwind v4 `@theme` tokens and Clay design tokens
- `api-go/` — Gin/Go backend
- `docs/` — migration and design plans

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

## TOOLCHAIN CONFIG

- `metro.config.js` — NativeWind v5 wrapper; aliases `react-native-reanimated` and `react-native-worklets` to `src/lib/*-web-stub.js` on web; keeps `inlineRequires: true`
- `babel.config.js` — `babel-preset-expo` + `react-native-reanimated/plugin`
- `postcss.config.mjs` — `@tailwindcss/postcss`
- `tsconfig.json` — strict mode; `@/*` → `./src/*`; includes `jest.setup.ts` and `nativewind-env.d.ts`
- `jest.config.js` — preset `jest-expo`; `setupFilesAfterEnv: ['<rootDir>/jest.setup.ts']`; ignores `/e2e/`; mocks `@clerk/expo` via `__mocks__/@clerk/expo.ts`
- `app.json` — scheme `kaplun`; 8 plugins, first is `expo-secure-store`
- `.gitignore` — excludes `.env`, `.env*.local`, `dist/`, `web-build/`, `ios/`, `android/`, `.omo/`, `.worktrees/`, Go build artifacts

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a screen | `src/app/(tabs)/<group>/` | Each group has `_layout.tsx` (Stack) + `index.tsx` |
| Add an Appwrite query | `src/lib/repository.ts` | Wrap in `executeWithRetryAndTimeout`; use `DATABASE_ID` + `TABLES` |
| Add an Appwrite table ID | `src/lib/constants.ts` + `src/lib/types.ts` | Constants are hardcoded Appwrite IDs |
| Add a data hook | `src/hooks/` | Follow existing React Query + repository pattern |
| Add realtime subscription | `src/lib/realtime.ts` | `useRealtimeSubscription(channel, () => queryClient.invalidateQueries(...))` |
| Add a backend API call | `src/lib/automations.ts` or `src/lib/auth-bridge.ts` | Clerk Bearer to `EXPO_PUBLIC_IG_API_BASE_URL` |
| Add an Instagram call | `src/lib/instagram.ts` | Direct Graph API; never add a proxy |
| Add a Clay component | `src/components/clay/` | Choose `@/tw` vs raw RN; add `.web.tsx` if using Reanimated |
| Add a styled primitive | `src/tw/` | Wrap with `useCssElement(Comp, props, { className: 'style' })` |
| Change a Clay color/token | `src/global.css` `@theme` | Update hardcoded hex in raw-RN components too |
| Fix Reanimated web crash | `metro.config.js` + `src/lib/reanimated-web-stub.js` + `worklets-web-stub.js` | Issue #8285 |
| Debug startup crash | `src/lib/logger.tsx` → `SplashLogger` | In-memory ring buffer; renders on-screen |
| Run backend locally | `api-go/` | `cp .env.example .env && go run ./cmd/server` (defaults to `:8000`) |

## DATA FLOW

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

## KEY FILES

| File | Role |
|------|------|
| `src/app/_layout.tsx` | Root layout: SafeAreaProvider → ClerkProvider → PersistQueryClientProvider → BridgeProvider → AuthGate → Slot |
| `src/lib/repository.ts` | Typed access layer over Appwrite TablesDB. All calls wrapped in `executeWithRetryAndTimeout` (15s timeout, 3 retries, backoff + jitter). |
| `src/lib/query-client.ts` | QueryClient singleton + AsyncStorage persister. Global defaults: `staleTime: 30_000`, `gcTime: 24h`, `retry: false`. Persisted cache: 24h maxAge, `buster: '1'` (bump to invalidate all), only success-state queries dehydrate. |
| `src/lib/resilient.ts` | `executeWithRetry`, `executeWithTimeout`, `executeWithRetryAndTimeout`. Retries network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never 4xx auth/validation. |
| `src/lib/auth-bridge.ts` | `createAppwriteSession` + `ensureAppwriteSession(getToken)`. 24h TTL fast path; throws `bridge_failed` on failure. |
| `src/lib/bridge-context.tsx` | `BridgeProvider` / `useBridge`. AuthGate mounts shell instantly; hooks gate on `isReady`. |
| `src/lib/instagram.ts` | Direct Instagram Graph API client (v26.0). Reads per-user token from `creators` row; refresh on Meta error 190. Throws `session_expired` / `insights_permission`. |
| `src/lib/automations.ts` | Comment-automation engine client. Clerk Bearer to `EXPO_PUBLIC_IG_API_BASE_URL`. |
| `src/lib/with-fresh-session.ts` | **Dead code** — legacy recovery for the old ig-api-proxy; no app module imports it. Do not reintroduce the proxy. |
| `src/lib/realtime.ts` | `useRealtimeSubscription(channels, callback)`: 2s debounce coalescing, exponential backoff reconnect (1s→30s), AppState foreground refetch. |
| `src/lib/reanimated-platform.ts` | Platform-safe Reanimated exports. Always import this, NOT `react-native-reanimated` directly. |
| `src/lib/appwrite.ts` | SDK singleton: `Client`, `Account`, `TablesDB`, `Storage`, `Realtime`. Uses `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. |
| `src/lib/constants.ts` | `DATABASE_ID = 'vernacular_saas'`, `TABLES` enum, `BUCKET_ID = 'attachments'`. |
| `src/lib/instagram-oauth.ts` | Instagram OAuth flow helpers. |
| `src/lib/fonts.ts` | `useClayFonts()` — loads Inter 400/500/600. Gates render in `AuthGate`. |

## CONVENTIONS

- **React Query** for all data: `useQuery` reads, `useMutation` writes, `queryClient.invalidateQueries()` / `setQueryData()` for cache updates. Global defaults live in `src/lib/query-client.ts` (`staleTime: 30_000`, `gcTime: 24h`, `retry: false`); hooks override `gcTime` to 5 min.
- **Query persistence**: `PersistQueryClientProvider` dehydrates success-state queries to AsyncStorage for 24h (`PERSIST_BUSTER = '1'` — bump it to invalidate every persisted cache). Anything a user must never see stale must refetch on restore, not rely on the persisted snapshot.
- **TablesDB, not Databases** — all Appwrite access is document-based via `TablesDB`.
- **Repository pattern** — all Appwrite queries go through typed functions in `@/lib/repository.ts`. Hooks never import `tablesDB` directly.
- **Instagram direct only** — every Instagram call goes through `@/lib/instagram.ts` → `graph.instagram.com` directly. No proxy, no instagrapi.
- **Auth bridge seam** — `EXPO_PUBLIC_IG_API_BASE_URL` is used only by `auth-bridge.ts` (`/auth/appwrite-session`) and `automations.ts` (`/automations/*`), both with Clerk Bearer. After bridging, the app talks to Appwrite directly.
- **Error conventions**: Instagram token missing/unusable → `throw new Error('session_expired')`. Auth bridge failure → `throw new Error('bridge_failed')`. These are unrelated.
- **Reanimated imports** — always from `@/lib/reanimated-platform` or `@/tw/animated`. Never directly from `react-native-reanimated`.
- **`.web.tsx` variants** — components with Reanimated get a `.web.tsx` variant using plain RN; Metro resolves it on web.
- **Styling split** — most screens/components use `@/tw` primitives with Tailwind `className`. Raw-RN `StyleSheet.create()` is reserved for ClayAnimatedButton, ClaySpinner, and AuthScreen to avoid Android layout bugs.
- **Path alias**: `@/*` → `./src/*`.
- **Token cache**: use Clerk's built-in `tokenCache` from `@clerk/expo/token-cache`.
- **Logging**: use `addLog()` from `@/lib/logger` instead of `console.log`/`console.warn`.
- **Package manager**: Bun. `expo install` excludes TypeScript (managed as devDependency only).
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

`EXPO_PUBLIC_IG_API_PROXY_URL` in `.env.example` is **legacy/dead**. The old Appwrite ig-api-proxy is broken (Appwrite strips the reserved `x-appwrite-user-jwt` header), so the app calls Instagram directly. Do not wire new code to it.

## NOTES

- **3-system architecture**: App → Appwrite TablesDB (CRUD + Realtime); App → `graph.instagram.com` directly (per-user token, refresh on 190); App → Gin `api-go` (auth bridge + automations engine).
- **SDK version**: Expo SDK **57** (`package.json`: `"expo": "^57.0.0"`). Read https://docs.expo.dev/versions/v57.0.0/.
- **React Query mutation pattern**: `useMutation` with `onSuccess: (result) => queryClient.setQueryData(...)`. See `useMessages`.
- **Realtime invalidation pattern**: `useRealtimeSubscription(channel, () => queryClient.invalidateQueries({ queryKey: [...] }))`. See `useThreads` / `useMessages`.
- **Auth bridge**: AuthGate runs `ensureAppwriteSession` with exponential backoff (max 3 retries), mounts `<Slot />` immediately, and shows a soft Retry banner only on failure.
- **Web export**: `dist/` is gitignored and not committed.
- **No root README**: use this file and `api-go/README.md` for orientation.
- **Large-file hotspots**: `src/app/(tabs)/(automate)/new.tsx` (~1.5k lines), `AuthScreen.tsx` (~800), home/insights/profile screens (~625-655), `(automate)/[automationId].tsx` (~625), `(automate)/index.tsx` (~555), `api-go/internal/worker/comment_runner.go` (~580). Prefer targeted edits over rewrites there.
- **`jest.setup.ts` is 312 lines of global mocks** — check it before adding per-file mocks; `@clerk/expo` is already mocked via `__mocks__/@clerk/expo.ts`.
- **`EdgeBlur` is not a blur** — it renders a plain `LinearGradient` canvas scrim; the real expo-blur layer crashed Android on screen transitions. The `blurTarget`/`intensity` props are kept only for call-site compatibility.
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
