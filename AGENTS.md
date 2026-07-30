# PROJECT KNOWLEDGE BASE — app/

**Generated:** 2026-07-29
**Commit:** (check: `git log --oneline -1`)
**Branch:** main

> Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## OVERVIEW

Expo SDK 57 mobile app ("creator-workspace") for Instagram creators. React Query + Appwrite TablesDB (CRUD + Realtime) + backend API (auth bridge + automations). Clay design system via Tailwind v4 + `react-native-css`. expo-router file-based routing. Bun (not npm).

**API migration:** Gin/Go server lives in `api-go/` (replacing FastAPI `api/`). Contracts: `docs/fastapi-to-gin-inventory.md`. Cutover: `docs/plans/2026-07-30-fastapi-to-gin-cutover.md`.

## STACK

- **Framework**: Expo SDK 57, React Native 0.86, React 19.2
- **Routing**: expo-router file-based
- **Data**: `@tanstack/react-query` (useQuery/useMutation/useQueries) → `@/lib/repository` (typed Appwrite calls with retry) → `tablesDB` (Appwrite TablesDB, not Databases)
- **Auth**: Clerk (`@clerk/expo`) → API `POST /auth/appwrite-session` (Gin or FastAPI) → Appwrite session (24h TTL fast path)
- **Instagram proxy**: App → Appwrite ig-api-proxy cloud function (Appwrite JWT auth, not Clerk Bearer). Gin also exposes Clerk-authed `/profile|/media|/insights|/disconnect` for FastAPI parity.
- **Styling**: NativeWind v5 + Tailwind CSS v4 + `react-native-css` (`useCssElement` bridge, not `styled()`)
- **Reanimated web workaround**: Metro aliases + platform wrappers for #8285 (Reanimated crashes on web)

## STRUCTURE

```
app/
├── src/
│   ├── app/                    # expo-router: _layout (Clerk + QueryClient) → AuthGate → (tabs)/(home|messages|profile)
│   ├── components/
│   │   ├── auth/AuthScreen.tsx # email+OTP+Google OAuth, raw StyleSheet (NOT @/tw)
│   │   └── clay/               # 6 Clay design components (.web.tsx variants for Reanimated safety)
│   ├── hooks/                  # 6 hooks: all use React Query + repository.ts
│   ├── lib/                    # 16 infra files: appwrite, repository, auth-bridge, resilient, realtime, etc.
│   ├── tw/                     # 5 styling primitives: className-enabled RN wrappers
│   ├── types/global.d.ts       # ErrorUtils, Buffer, __lastFatalError augmentations
│   └── __tests__/              # 6 jest-expo test files
├── global.css → src/global.css # Tailwind v4 @theme (Clay tokens, platform fonts)
├── app.json                    # scheme "kaplun", 8 plugins (expo-secure-store first)
├── metro.config.js             # NativeWind + reanimated/worklets web stubs (#8285)
└── jest.setup.ts               # Global mock suite (~200 lines)
```

## COMMANDS

```bash
bun install              # install deps
bun start                # expo dev server
bun start --android      # dev + Android
bun start --ios          # dev + iOS
bun start --web          # dev + web
bun test                 # jest-expo
bun run lint             # tsc --noEmit
```

No EAS config, no CI. Web export (`dist/`) is committed to git.

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a screen | `src/app/(tabs)/<group>/` | expo-router file-based; each group has `_layout.tsx` (Stack) + `index.tsx` |
| Add an Appwrite query | `src/lib/repository.ts` | Typed functions with `executeWithRetryAndTimeout`; add a new function here |
| Add an Appwrite table ID | `src/lib/constants.ts` (`TABLES` enum) + `src/lib/types.ts` for the shape | |
| Add a data hook | `src/hooks/` | All hooks use `useQuery`/`useMutation` from `@tanstack/react-query` on repository functions |
| Add realtime subscription | `src/lib/realtime.ts` | `useRealtimeSubscription(channel, () => queryClient.invalidateQueries(...))` |
| Add a FastAPI/Instagram call | `src/lib/instagram.ts` | Uses Appwrite JWT auth via `account.createJWT()`, NOT Clerk Bearer |
| Add a Clay component | `src/components/clay/` | Decide `@/tw` vs raw RN; add `.web.tsx` if using Reanimated |
| Add a styled primitive | `src/tw/` | `useCssElement(RNComponent, props, { className: 'style' })` |
| Change a Clay color/token | `src/global.css` `@theme` | Some hex values duplicated in raw-RN components — update both |
| Fix Reanimated web crash | `metro.config.js` + `src/lib/reanimated-web-stub.js` + `worklets-web-stub.js` | Issue #8285 |
| Debug startup crash | `src/lib/logger.tsx` → `SplashLogger` | In-memory ring buffer; renders on-screen if fatal |

## DATA FLOW

```
Screen → Hook (useQuery/useMutation)
  → @/lib/repository (typed, with executeWithRetryAndTimeout)
    → tablesDB (Appwrite TablesDB singleton)
      → Appwrite

Instagram operations:
  → @/lib/instagram (Appwrite JWT auth, executeWithRetry)
    → Appwrite ig-api-proxy cloud function
      → Instagram Graph API

Auth bridge (once per sign-in):
  Clerk getToken() → FastAPI /auth/appwrite-session → account.createSession()
  → ensureAppwriteSession() with 24h TTL fast path + exponential backoff retry
```

## KEY FILES

| File | Role |
|------|------|
| `src/app/_layout.tsx` | Root: SafeAreaProvider → ClerkProvider → QueryClientProvider → AuthGate → Slot |
| `src/lib/repository.ts` | Typed access layer over Appwrite TablesDB: `getCreatorByClerkId`, `listThreads`, `listMessages`, `sendMessage`, `batchMarkAsRead`, `listDeals`, `listPosts`, `getLastMessagePreviews`. All wrapped in `executeWithRetryAndTimeout`. |
| `src/lib/resilient.ts` | `executeWithRetry()` (3 attempts, backoff + jitter), `executeWithTimeout()`, `executeWithRetryAndTimeout()`. Retries: network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 4xx auth/validation. |
| `src/lib/auth-bridge.ts` | `ensureAppwriteSession(getToken)` with 24h TTL fast path, parallel deleteSession + backend fetch. Throws `bridge_failed` on exchange failure. |
| `src/lib/bridge-context.tsx` | `BridgeProvider` / `useBridge` — Appwrite readiness. AuthGate mounts shell instantly; hooks wait on `isReady`. Soft Retry banner on failure. |
| `src/lib/instagram.ts` | `fetchProfile`, `fetchMedia`, `fetchInsights`, `disconnectInstagram`. Auth via `account.createJWT()` → `x-appwrite-user-jwt` header (NOT Clerk Bearer). Base URL from `EXPO_PUBLIC_IG_API_PROXY_URL`. |
| `src/lib/with-fresh-session.ts` | `withFreshSession(fn, getToken)` — wraps Instagram calls: if `session_expired`, re-bridges Appwrite session then retries once. |
| `src/lib/realtime.ts` | `useRealtimeSubscription(channels, callback)`. Features: 2s debounce coalescing, exponential backoff reconnect (1s→30s), AppState foreground refetch. |
| `src/lib/reanimated-platform.ts` | Platform-safe Reanimated exports. `IS_REANIMATED_AVAILABLE = Platform.OS !== 'web'`. Always import this, NOT `react-native-reanimated` directly. |
| `src/lib/appwrite.ts` | SDK singleton: `Client`, `Account`, `TablesDB`, `Storage`, `Realtime`. Uses `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. |
| `src/lib/constants.ts` | `DATABASE_ID` = `'vernacular_saas'`, `TABLES` enum (CREATORS, POSTS, DEAL_THREADS, MESSAGES, DEALS), `BUCKET_ID` = `'attachments'`. |
| `src/lib/instagram-oauth.ts` | Instagram OAuth flow helpers. |
| `src/lib/fonts.ts` | `useClayFonts()` — loads Inter 400/500/600 via `@expo-google-fonts/inter`. Gates render in AuthGate. |

## CONVENTIONS

- **Data**: React Query (`@tanstack/react-query`) throughout. `useQuery` for reads, `useMutation` for writes, `useQueryClient.invalidateQueries()` for refetch triggers. `staleTime: 30_000`, `gcTime: 5 * 60_000`, `retry: false` in production hooks.
- **Persistence**: Appwrite TablesDB (not SQL Databases). Typed via `@/lib/repository.ts`. All calls wrapped in `executeWithRetryAndTimeout()` (3 attempts, backoff + jitter, 15s timeout).
- **Instagram API**: Every call goes through `@/lib/instagram.ts` using Appwrite JWT auth (`account.createJWT()`). The auth-bridge (`EXPO_PUBLIC_IG_API_BASE_URL`) and Instagram proxy (`EXPO_PUBLIC_IG_API_PROXY_URL`) are separate endpoints.
- **Auth**: Clerk JWT → FastAPI `/auth/appwrite-session` → Appwrite session. AuthGate mounts tabs immediately; data hooks wait on `useBridge().isReady`. Failures surface as soft Retry (`bridge_failed`), not Instagram `session_expired`.
- **`session_expired`**: Instagram proxy 401 → `throw new Error('session_expired')`. Recovery via `withFreshSession(fn, getToken)` which re-bridges the Appwrite session and retries. Hooks surface this as `error: 'session_expired'` for re-login UI.
- **Fonts**: Inter 400/500/600 via `@expo-google-fonts/inter`; loaded at boot via `useClayFonts()`; gates render in `AuthGate`.
- **Reanimated**: Import from `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly). Metro aliases + web stubs on web.
- **`.web.tsx` variants**: Components using Reanimated get a `.web.tsx` variant — Metro resolves on web.
- **Path alias**: `@/*` → `./src/*`.
- **Token cache**: `tokenCache` from `@clerk/expo/token-cache` (Clerk's built-in), not a custom implementation.
- **Package manager**: Bun (`bun.lock`). `expo install` excludes TypeScript (managed as devDependency only).
- **No ESLint/Prettier/Biome**: lint = `tsc --noEmit` only. `lightningcss` pinned to 1.30.1 in `resolutions`.
- **`cancelledRef`**: Still used in `useCreatorProfile` and home screen for legacy unmount safety alongside React Query.

## ANTI-PATTERNS (THIS PROJECT)

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives. Exceptions: `@/tw/*` wrapper files, `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`, and raw-RN Clay components.
- **NO `StyleSheet.create()` in screens** — use Tailwind `className`. Exceptions: `@/tw/index.tsx` internals; ClayAnimatedButton, ClaySpinner, AuthScreen (documented Android layout-bug avoidance).
- **NO bare `catch {}`** — always name the error.
- **NO `as any`** — prefer `unknown` + type guards.
- **NO `console.log`/`console.warn`** — use `addLog()` from `@/lib/logger`.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform`.
- **NO direct `react-native-reanimated` for AnimatedView** — use `@/tw/animated`.
- **NO hardcoded secrets** — `EXPO_PUBLIC_*` env vars only.
- **NO direct instagrapi/Instagram API calls** — app talks to Appwrite ig-api-proxy cloud function only.
- **NO `@ts-ignore` / `@ts-expect-error`** — zero tolerance.
- **NO `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO `account.createSession()` outside `auth-bridge.ts`** — auth bridge is the only session creator.
- **NO direct Fetch/AbortController in hooks** — use `executeWithRetry`, `executeWithTimeout`, or `executeWithRetryAndTimeout` from `@/lib/resilient`.

## UNIQUE STYLES

- **Clay design system** — `src/components/clay/` (6 components). Cream canvas `#fffaf0`, saturated single-color feature cards, dark-navy CTAs, Inter display type, claymation press animations. Design tokens in `src/global.css` `@theme`. Components split: `@/tw`-based (Tailwind classes) vs raw-RN (StyleSheet + hardcoded hex for Android layout-bug avoidance). See `src/components/clay/AGENTS.md`.
- **`useCssElement` bridge** — `@/tw` primitives use `react-native-css`'s `useCssElement(Comp, props, { className: 'style' })`, NOT NativeWind `styled()`.
- **AuthGate as component, not route** — Conditionally renders `<AuthScreen />` vs `<Slot />` in `_layout.tsx`.
- **Startup crash logger** — `polyfills.ts` + `logger.tsx` capture errors before UI renders; `SplashLogger` renders them on-screen.

## ENV VARS

| Variable | Used In |
|----------|---------|
| `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` | `_layout.tsx` (ClerkProvider) |
| `EXPO_PUBLIC_APPWRITE_ENDPOINT` | `lib/appwrite.ts` |
| `EXPO_PUBLIC_APPWRITE_PROJECT_ID` | `lib/appwrite.ts` |
| `EXPO_PUBLIC_IG_API_BASE_URL` | `lib/auth-bridge.ts` (FastAPI bridge) |
| `EXPO_PUBLIC_IG_API_PROXY_URL` | `lib/instagram.ts` (Appwrite ig-api-proxy) |
| `EXPO_PUBLIC_IG_APP_ID` | Instagram OAuth |
| `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` | Instagram OAuth |

## NOTES

- **3-system architecture**: App → Appwrite TablesDB (CRUD + Realtime); App → Appwrite ig-api-proxy → Instagram; App → FastAPI → Appwrite session (auth bridge only).
- **SDK version**: Expo SDK **57** (`package.json`: `"expo": "^57.0.0"`). Read https://docs.expo.dev/versions/v57.0.0/.
- **React Query mutation pattern**: `useMutation` with `onSuccess: (result) => queryClient.setQueryData(...)` for optimistic cache updates. See `useMessages` for the pattern.
- **Realtime invalidation pattern**: Subscribe in `useEffect` → on event → `queryClient.invalidateQueries({ queryKey: [...] })`. See `useThreads` and `useMessages`.
- **Auth bridge**: `_layout.tsx` AuthGate runs `ensureAppwriteSession` with exponential backoff (max 3 retries) after sign-in, mounts `<Slot />` immediately, and shows a soft Retry banner only if the bridge fails.
- **`dist/` committed**: Web export output is checked into git.
- **`expo-secure-store` first in plugins**: Unusual order — see `app.json`.
- **No Tamagui**: This app uses NativeWind v5 + Tailwind v4 + react-native-css. Root `D:\001\AGENTS.md` references to Tamagui are stale.

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

- `src/lib/AGENTS.md` — infrastructure layer (Appwrite, repository, auth-bridge, Instagram proxy, resilience, realtime)
- `src/hooks/AGENTS.md` — data layer (6 hooks, React Query pattern, repository.ts split)
- `src/components/clay/AGENTS.md` — Clay design system (6 components, `.web.tsx` variants)
- `src/tw/AGENTS.md` — styling primitives (className-enabled RN wrappers)
