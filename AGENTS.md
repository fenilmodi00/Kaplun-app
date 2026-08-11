# PROJECT KNOWLEDGE BASE — Kaplun app

**Generated:** 2026-08-10
**Commit:** 47518a2
**Branch:** ui/dark-theme

> Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any Expo-specific code.

## OVERVIEW

Kaplun is an Expo SDK 57 mobile app for Instagram creators. It uses React Native 0.86, React 19.2, and a Bun-based TypeScript toolchain. The backend is a Go/Gin service in `api-go/` (the old FastAPI `api/` has been removed). Data lives in Appwrite TablesDB, authentication is handled by Appwrite, and Instagram operations call Meta's Graph API directly from the app using per-user long-lived tokens.

The visual language is **Clay**, now dual-scheme: a light cream canvas (`#fffaf0`) and a dark AMOLED canvas (`#000000`, the default), switched by an in-app Dark/Light toggle on the profile screen. Tokens live in `src/global.css` (`@theme` light block + `@media (prefers-color-scheme: dark)` override), are mirrored into `src/lib/theme.ts` for raw-RN islands, and are applied at runtime via NativeWind's `VariableContextProvider` in the root layout. The full design manual is in `DESIGN.md`.

Key architectural decisions:

- **Frontend:** Expo Router file-based routing (`src/app/`), React Query with AsyncStorage persistence, NativeWind v5 + Tailwind CSS v4 + `react-native-css` for styling.
- **Backend:** Gin/Go (`api-go/`) exposes the auth bridge, automations engine, Instagram OAuth callback, Meta webhooks, and cron endpoints.
- **Data:** Appwrite TablesDB (document-store API) accessed through a typed repository layer (`src/lib/repository.ts`).
- **Instagram:** Direct calls to `graph.instagram.com` from the app; token refresh on Meta error 190. No proxy, no instagrapi.
- **Automations:** Comment-triggered Instagram DM automations run through `api-go`, with an in-process worker pool, sweeper, and reconcile poller.

## TECHNOLOGY STACK

| Layer | Tech | Notes |
|-------|------|-------|
| Mobile framework | Expo SDK 57, React Native 0.86, React 19.2 | File-based routing via `expo-router`. |
| Language | TypeScript 5.9 | Strict mode enabled (`tsconfig.json`). |
| Package manager | Bun 1.3+ | `bun.lock` is the lockfile. `expo install` excludes TypeScript. |
| Styling | NativeWind v5, Tailwind CSS v4, `react-native-css` | `useCssElement` bridge in `src/tw/`. |
| Theming | `src/lib/theme.ts` + `global.css` | Dark default; `useThemeColors()` for raw-RN islands; `VariableContextProvider` runtime override; web is light-only. |
| Animations | React Native Reanimated 4.5.0 | Imported only via `@/lib/reanimated-platform` or `@/tw/animated`. Web uses no-op stubs. |
| State / data | TanStack React Query 5 | Persisted to AsyncStorage for 24h. |
| Auth | Appwrite (`appwrite`) | Appwrite account + JWT verified by Go backend. |
| Backend | Go 1.25, Gin 1.12 | Module path `kaplun/api-go`. |
| Database | Appwrite TablesDB | Document-based; NOT the SQL Databases API. |
| Instagram | Meta Graph API v26.0 | Direct from app and backend. |
| Testing | jest-expo, Go `testing` package | Frontend tests in `src/__tests__/`. |
| Lint | `tsc --noEmit` | No ESLint/Prettier/Biome config. |

Legacy files still in the repo:

- `ig_client.py` — old instagrapi Python wrapper. **Dead code**; do not use or extend.
- `db/schema.sql` — old SQLite schema for a Python-era feature. Not used by the current app.

## REPOSITORY STRUCTURE

```
.
├── api-go/                 # Go/Gin backend
│   ├── cmd/server/         # Entry point + dependency wiring
│   ├── internal/
│   │   ├── router/         # Gin engine + route registration
│   │   ├── middleware/     # RequestID, Recovery, CORS, Appwrite JWT auth, cron secret
│   │   ├── handlers/       # HTTP handlers (bridge, automations, webhooks, cron, oauth)
│   │   ├── services/       # Business logic (automations, bridge, oauth, reconcile, insights, etc.)
│   │   ├── store/          # Appwrite persistence layer
│   │   ├── platform/       # External clients (appwrite, clerk JWT, meta, cloudflare, webhooks)
│   │   ├── models/         # Request/response types
│   │   └── worker/         # Job pool, sweeper, comment runner
│   ├── .env.example        # Backend env template
│   └── README.md           # Backend-specific run/test guide
├── src/
│   ├── app/(tabs)/         # Expo Router screens; 4 tabs: home, automate, messages, insights
│   │   ├── (home)/         # Home / dashboard (owns the only navigation to profile)
│   │   ├── (automate)/     # Automations list, detail, create
│   │   ├── (messages)/     # Threads + thread detail
│   │   ├── (insights)/     # Instagram insights
│   │   └── (profile)/      # Creator profile + theme toggle; NOT a tab — pushed from home avatar
│   ├── components/         # UI components
│   │   ├── clay/           # Clay design-system components
│   │   ├── ui/             # Form primitives (input, switch, badge, etc.)
│   │   └── auth/           # AuthScreen
│   ├── hooks/              # React Query data hooks
│   ├── lib/                # Infrastructure (Appwrite, repository, session, theme, Instagram, etc.)
│   ├── tw/                 # className-enabled RN primitives
│   ├── types/              # Global TypeScript types
│   └── __tests__/          # Jest test suites
├── __mocks__/              # Jest manual mocks (@expo/ui)
├── assets/                 # App icons + splash
├── docs/                   # Architecture/design docs and migration plans
├── db/schema.sql           # Legacy SQLite schema (unused)
├── ig_client.py            # Legacy instagrapi wrapper (unused)
├── package.json            # Bun/Expo dependencies and scripts
├── app.json                # Expo app config
├── tsconfig.json           # TypeScript config (strict, `@/*` alias)
├── jest.config.js          # jest-expo preset + transformIgnorePatterns
├── jest.setup.ts           # 340-line global test mock setup
├── metro.config.js         # NativeWind + Reanimated/Worklets web aliases
├── babel.config.js         # babel-preset-expo + reanimated plugin
├── postcss.config.mjs      # Tailwind v4 PostCSS
├── global.css              # Tailwind theme tokens (Clay design system)
├── .env.example            # App env template
└── AGENTS.md               # This file
```

Subdirectory guides (read these before editing the relevant area):

- `api-go/AGENTS.md` — Gin backend conventions, routes, in-process loops, auth, workers, tunnel.
- `src/app/AGENTS.md` — route tree, provider stack, `Stack.Protected` auth gate, 4-tab + hidden profile.
- `src/lib/AGENTS.md` — Appwrite, repository, session, theme, Instagram, resilience, realtime.
- `src/hooks/AGENTS.md` — React Query hooks, repository pattern, realtime invalidation.
- `src/components/AGENTS.md` — non-Clay components: `ui/` kit, `auth/`, `automation/`, screen shell.
- `src/components/clay/AGENTS.md` — Clay design system, `.web.tsx` variants, raw-RN exceptions.
- `src/tw/AGENTS.md` — styling primitives and `useCssElement` bridge.
- `src/__tests__/AGENTS.md` — jest-expo conventions, mock boundary, render flavors, known failures.

## BUILD, RUN, AND TEST COMMANDS

### App (Expo)

```bash
bun install              # install dependencies
bun start                # Expo dev server
bun start --android      # dev + Android
bun start --ios          # dev + iOS
bun start --web          # dev + web
bun run lint             # tsc --noEmit (no ESLint/Prettier/Biome)
```

### App tests

```bash
# Preferred test runner (jest-expo)
npx jest
npx jest --testPathPattern=instagram
npx jest --testPathIgnorePatterns=integration

# Bun also has a `test` script, but `bun test` currently crashes with a
# segmentation fault in this environment (Bun v1.3.3). Use `npx jest` until
# that is resolved.
```

A known pre-existing failure exists in `src/__tests__/ui-components.test.tsx` (two `Input` style assertions fail because the mocked CSS runtime flattens style arrays differently). All other suites pass.

### Native dependencies

Direct native deps (custom dev client, not Expo Go): `@react-native-community/netinfo`, `react-native-gesture-handler`, `react-native-pager-view`, `@shopify/react-native-skia`.

- **Rule:** adding any new native package requires a new EAS `development` build before device testing. JS-only work can ship via Metro until then.
- Root wiring lives in `src/app/_layout.tsx`: `GestureHandlerRootView`, React Query `onlineManager` (NetInfo) + `focusManager` (AppState). Offline-first session/auth fixes stay in the `offline-first-p0` plan — do not duplicate NetInfo install/wiring there.
- PagerView and Skia are installed but unused in UI; import the packages directly when building features (no wrapper until needed).
- **Bun + Skia:** `@shopify/react-native-skia` must be in `package.json` `trustedDependencies` so Bun runs its `postinstall` (`install-libs.js`), which copies `libskia.a` into `libs/android`. Without that, EAS Gradle fails with `Could not find libskia.a` / `Run npx install-skia`. After adding Skia: `bun pm trust @shopify/react-native-skia` (or reinstall) once locally.
- PanelUI / Uniwind are **not** adopted; NativeWind + Clay stay.

### Backend (api-go)

```bash
cd api-go
cp .env.example .env     # first run; fill secrets
go run ./cmd/server      # dev server on :8000 (IG_API_PORT); cold build 30–60s
go build -o server.exe ./cmd/server && ./server.exe   # faster re-runs
go test ./...            # all backend tests
go test ./internal/services/automations  # single package
```

Backend tests do not require external services (Appwrite/Meta clients are interfaced and faked).

## ARCHITECTURE

### Three-system design

1. **App → Appwrite TablesDB** for CRUD + Realtime (via `@/lib/repository`).
2. **App → `graph.instagram.com`** directly for Instagram data (via `@/lib/instagram`).
3. **App → Gin `api-go`** for auth bridge + automations engine (via `@/lib/session-context` and `@/lib/automations`), using Appwrite JWT Bearer tokens.

```
Screen → Hook (useQuery/useMutation)
  → @/lib/repository (typed, executeWithRetryAndTimeout)
    → tablesDB (Appwrite TablesDB singleton)
      → Appwrite

Instagram operations:
  → @/lib/instagram (reads token from creators row)
    → graph.instagram.com directly (per-user long-lived token)
    → on Meta error 190: ig_refresh_token → updateCreatorToken() → retry once

Auth bridge:
  SessionProvider (`@/lib/session-context`) restores the Appwrite session on launch via
  `@/lib/auth-session` utilities and fire-and-forget calls Gin POST /auth/ensure-profile;
  useAuthFlow is the only place account.createSession() runs
```

### Backend (api-go)

- `cmd/server/main.go` loads `.env`, builds optional dependencies, starts the HTTP server, and optionally launches a Cloudflare quick tunnel in the background.
- Route groups are registered only when their dependencies are available, so `/health` always answers even if secrets are missing.
- Auth modes:
  - Appwrite JWT Bearer for app-facing routes (`/auth/*`, `/automations/*`).
  - `X-Cron-Secret` for `/cron/*`.
  - Meta HMAC `x-hub-signature-256` for `POST /webhooks/instagram`.
  - No auth for `/health`, `GET /webhooks/instagram`, `GET /instagram/callback`.
- In-process loops (gated by `AUTOMATION_SWEEPER_ENABLED=true`):
  - Worker pool + sweeper retries pending automation jobs.
  - Reconcile poller catches comments webhooks miss.
  - Daily long-lived token refresh.
- First-party insights sync is gated separately by `INSIGHTS_SYNC_ENABLED`.

## CODE STYLE AND CONVENTIONS

### TypeScript / React Native

- **Path alias:** `@/*` maps to `./src/*`.
- **Strict TypeScript:** `tsc --noEmit` must pass. No `as any`, `@ts-ignore`, or `@ts-expect-error`.
- **Error handling:** always name the error (`catch (err: unknown)`) and guard before rethrowing. No bare `catch {}`.
- **Logging:** use `addLog()` from `@/lib/logger` instead of `console.log`/`console.warn`.
- **Data fetching:** React Query for all reads (`useQuery`) and writes (`useMutation`). Global defaults: `staleTime: 30_000`, `gcTime: 24h`, `retry: false`. Hooks override `gcTime` to 5 min.
- **Resilience:** wrap network calls with `executeWithRetry`, `executeWithTimeout`, or `executeWithRetryAndTimeout` from `@/lib/resilient` (15s timeout, 3 attempts, exponential backoff + jitter; never retries 4xx).
- **Styling:** use `@/tw` primitives (`View`, `Text`, `Pressable`, etc.) with Tailwind `className`. Raw `StyleSheet.create()` is reserved for documented exceptions (`ClayAnimatedButton`, `ClaySpinner`, `AuthScreen`) to avoid Android layout bugs.
- **Images:** use `@/tw/image`, not `expo-image` or RN `Image` directly.
- **Reanimated:** import only from `@/lib/reanimated-platform` or `@/tw/animated`. Never import `react-native-reanimated` directly.
- **Web safety:** components using Reanimated provide a `.web.tsx` variant with plain RN; `metro.config.js` aliases `react-native-reanimated` and `react-native-worklets` to no-op stubs on web (#8285).

### Appwrite / data access

- **TablesDB only:** use Appwrite's document-store `TablesDB` API. Never use the SQL `Databases` API.
- **Repository pattern:** all Appwrite queries go through typed functions in `@/lib/repository.ts`. Hooks never import `tablesDB` directly.
- **Hardcoded IDs:** `DATABASE_ID`, `TABLES`, and `BUCKET_ID` live in `src/lib/constants.ts`; document shapes live in `src/lib/types.ts`.
- **Session seam:** `account.createSession()` is called only in `useAuthFlow` (`src/hooks/useAuthFlow.ts`); session persistence utilities live only in `@/lib/auth-session`.

### Instagram

- All Instagram calls go through `@/lib/instagram.ts` → `graph.instagram.com` directly.
- The per-user long-lived token is read from the `creators` row; on Meta error 190 the app refreshes it and persists via `updateCreatorToken()`.
- Missing/unusable token throws `Error('session_expired')`; insufficient token scope throws `Error('insights_permission')`.
- `EXPO_PUBLIC_IG_API_PROXY_URL` is **legacy/dead** — the old Appwrite ig-api-proxy is broken (Appwrite strips the reserved `x-appwrite-user-jwt` header). Do not wire new code to it.

### Backend (Go)

- Pass `*slog.Logger` down; do not use `log.Println`.
- Return the standard error shape `ErrorResponse{error, message}`.
- Ownership mismatches return `404` (not 403); expired sessions return `401 {"error":"session_expired"}`.
- Valid webhooks always return `200 {"status":"ok"}` even when processing fails.
- Creator tokens are stored **plaintext by design** so the Expo app can read `access_token` directly.

## TESTING STRATEGY

- **Frontend:** jest-expo with `jest.setup.ts` providing global infra mocks (expo-router, Appwrite, `@/tw`, Reanimated, AsyncStorage, `@expo/ui`, etc.). Data hooks are mocked per-file. Check `jest.setup.ts` before adding per-file mocks; see `src/__tests__/AGENTS.md`.
- **Backend:** colocated `*_test.go` files using `httptest` and table-driven tests. No external services required.
- **Coverage:** `collectCoverageFrom: ['src/**/*.{ts,tsx}']` in `jest.config.js`.
- **Known issues:**
  - `bun test` segfaults in this environment; use `npx jest`.
  - `src/__tests__/ui-components.test.tsx` has two failing `Input` style assertions (pre-existing).

## SECURITY CONSIDERATIONS

- **Secrets are env-only.** Use `EXPO_PUBLIC_*` for app-facing values and backend env vars for server secrets. Never hardcode keys, tokens, or credentials.
- **Appwrite:** the app uses `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. The backend uses `APPWRITE_API_KEY` for server-side operations and verifies Appwrite JWTs by calling Appwrite `/account` (no server-side JWT key).
- **Instagram:** OAuth app ID/secret (`INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`) must match `EXPO_PUBLIC_IG_APP_ID`. Webhook HMAC verification uses `FACEBOOK_APP_SECRET`.
- **Cron endpoints** require `CRON_SECRET` in the `X-Cron-Secret` header.
- **Cloudflare tunnel:** the backend can open a public quick tunnel locally. Quick tunnels get a new `*.trycloudflare.com` host on every restart; do not use them for production.
- **Plaintext tokens:** creator Instagram access tokens are stored unencrypted by design (the app reads them directly). Treat the Appwrite project and API key as highly sensitive.
- **Webhook signature bypass:** `WEBHOOK_INSECURE_SKIP_SIGNATURE` exists for local diagnosis only and must never be enabled in production.

## DEPLOYMENT AND LOCAL DEVELOPMENT

- **No CI workflows, no Dockerfile.** Deployment is currently manual. `eas.json` exists (development/preview/production profiles, CLI >= 14) for manual EAS builds: `eas build --profile development --platform android` produces a dev-client APK with `EXPO_PUBLIC_*` env embedded.
- **Local backend:** run `api-go` with `cp .env.example .env && go run ./cmd/server`. Default port `:8000`.
- **Local tunnel:** Cloudflare quick tunnel is enabled by default (`CLOUDFLARE_TUNNEL_ENABLED=true`) so Meta webhooks/OAuth work without ngrok's free interstitial. Requires `cloudflared` on PATH or `api-go/tools/cloudflared.exe`.
- **Expo dev client:** point the app at the backend with `EXPO_PUBLIC_IG_API_BASE_URL` (e.g., `http://localhost:8000` for emulator, your LAN IP for a physical device, or the Cloudflare tunnel URL).
- **Meta developer settings:** when using a quick tunnel, update the Meta OAuth redirect URI, webhook callback URL, `REDIRECT_URI`, and `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` to match the logged public URL. Use a named Cloudflare tunnel for a stable hostname.

## ENVIRONMENT VARIABLES

### App (`/.env`)

| Variable | Used in | Purpose |
|----------|---------|---------|
| `EXPO_PUBLIC_APPWRITE_ENDPOINT` | `lib/appwrite.ts` | Appwrite API endpoint |
| `EXPO_PUBLIC_APPWRITE_PROJECT_ID` | `lib/appwrite.ts` | Appwrite project ID |
| `EXPO_PUBLIC_IG_API_BASE_URL` | `lib/session-context.tsx`, `lib/automations.ts` | Gin api-go base URL |
| `EXPO_PUBLIC_IG_APP_ID` | `lib/instagram-oauth.ts` | Instagram OAuth app ID |
| `EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI` | `lib/instagram-oauth.ts` | Instagram OAuth redirect URI |
| `EXPO_PUBLIC_IG_API_PROXY_URL` | legacy/dead | Do not use |

### Backend (`/api-go/.env`)

| Variable | Purpose |
|----------|---------|
| `IG_API_PORT` | Server port (default 8000) |
| `APPWRITE_ENDPOINT` / `APPWRITE_PROJECT_ID` / `APPWRITE_API_KEY` | Appwrite server client (JWTs are verified by calling Appwrite `/account`; no server-side JWT key) |
| `APPWRITE_DATABASE_ID` / `APPWRITE_CREATORS_TABLE_ID` | Appwrite DB/table IDs |
| `APPWRITE_AUTOMATIONS_TABLE_ID` / `APPWRITE_AUTOMATION_LOGS_TABLE_ID` / `APPWRITE_AUTOMATION_JOBS_TABLE_ID` | Automation tables |
| `APPWRITE_CREATOR_MEDIA_TABLE_ID` / `APPWRITE_CREATOR_INSIGHT_DAYS_TABLE_ID` / `APPWRITE_CREATOR_AUDIENCE_DEMOGRAPHICS_TABLE_ID` / `APPWRITE_CREATOR_ONLINE_FOLLOWERS_TABLE_ID` / `APPWRITE_MENTIONED_MEDIA_TABLE_ID` | Insights tables (all 5 required for insights sync) |
| `CORS_ORIGINS` | Gin CORS allowlist (default `*`) |
| `COMMENT_POLL_INTERVAL_MS` | Reconcile poller interval (default 300000; read directly in adapters.go, not config.go) |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` / `REDIRECT_URI` | Instagram OAuth |
| `WEBHOOK_VERIFY_TOKEN` / `FACEBOOK_APP_SECRET` | Meta webhook verification |
| `CRON_SECRET` | Cron endpoint auth |
| `PUBLIC_BASE_URL` | Public URL for webhooks/OAuth |
| `AUTOMATION_SWEEPER_ENABLED` | Starts in-process worker/sweeper/reconcile loops (default true) |
| `INSIGHTS_SYNC_ENABLED` | Starts first-party insights sync (default false) |
| `CLOUDFLARE_TUNNEL_ENABLED` / `CLOUDFLARE_TUNNEL_TOKEN` / `CLOUDFLARE_TUNNEL_NAME` / `CLOUDFLARE_TUNNEL_URL` | Cloudflare tunnel settings |

## ANTI-PATTERNS

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives. Exceptions are documented (`Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`, and raw-RN Clay components).
- **NO `StyleSheet.create()` in screens** — use Tailwind `className`.
- **NO bare `catch {}`** — always name the error.
- **NO `as any` / `@ts-ignore` / `@ts-expect-error`** — prefer `unknown` + type guards.
- **NO `console.log`/`console.warn`** — use `addLog()`.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform` or `@/tw/animated`.
- **NO hardcoded hex colors** — add tokens to `src/global.css` `@theme` (+ the dark `@media` override) and mirror them in `src/lib/theme.ts`; `@/tw` components use Tailwind classes, raw-RN islands use `useThemeColors()`. `theme.test.ts` enforces palette parity.
- **NO OS-scheme branching** — `resolveScheme` ignores the system scheme by design (explicit Dark/Light preference, dark default). Web is hardcoded light.
- **NO hardcoded secrets** — env vars only.
- **NO direct instagrapi / proxy** — Instagram calls go through `@/lib/instagram.ts`.
- **NO `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO `account.createSession()` outside `useAuthFlow`** — the auth flow hook is the only session creator.
- **NO direct Fetch/AbortController in hooks** — use `executeWithRetry`, `executeWithTimeout`, or `executeWithRetryAndTimeout`.
- **NO `Databases` SDK** — use `TablesDB` only.
- **NO hardcoded Appwrite IDs outside `constants.ts`** — `DATABASE_ID` and `TABLES` are the single source of truth.

## NOTES AND GOTCHAS

- **Large-file hotspots** (prefer targeted edits): `src/app/(tabs)/(automate)/new.tsx` (~1270 lines), `AuthScreen.tsx` (~760 lines), `(profile)/index.tsx` (~700), `(automate)/[automationId].tsx` (~690), home/insights screens (~645–665 lines), `api-go/internal/worker/comment_runner.go` (~1247 lines).
- **`jest.setup.ts` is ~315 lines of global mocks** — check it before adding per-file mocks; conventions live in `src/__tests__/AGENTS.md`.
- **`EdgeBlur` is not a blur** — it renders a plain `LinearGradient` canvas scrim because the real `expo-blur` layer crashed Android on screen transitions. The `blurTarget`/`intensity` props are kept only for call-site compatibility.
- **api-go in-process loops** — sweeper, reconcile poller, token refresh, and insights sync all run inside the server process. No external scheduler is required.
- **Reanimated web crash (#8285)** — `metro.config.js` aliases `react-native-reanimated` and `react-native-worklets` to no-op stubs on web. `metro.config.js` also keeps `inlineRequires` lazy imports for worklets (#9445) — do not remove.
- **Theme system** — four token representations must stay in sync: `global.css` `@theme` ↔ `global.css` dark `@media` block ↔ `lightColors`/`darkColors` ↔ `lightCssVariables`/`darkCssVariables` (both pairs in `src/lib/theme.ts`). `GlassSurface` is intentionally always dark charcoal in both schemes. `(profile)` is not a tab — it is pushed from the home avatar via `router.push('/(tabs)/(profile)' as never)`.
- **`EXPO_PUBLIC_IG_API_PROXY_URL` config drift** — the var is dead but still present in `.env`, `.env.example`, and `jest.setup.ts`; safe to delete those three lines, do not wire new code to it.
- **Rule exceptions found in code** — `src/components/ui/input.tsx`/`textarea.tsx` use `StyleSheet.create()` (Android font-metric stability, intentional); `(profile)/index.tsx` and `(automate)/[automationId].tsx` use `StyleSheet.create()` as documented escape hatches; `(messages)/[threadId].tsx` calls `tablesDB.getRow()` directly and casts `Reanimated.SlideInUp as any` (known smells, fix or consciously preserve).
- **SplashLogger** — use `addLog()` + `SplashLogger` from `@/lib/logger` to debug startup crashes; it renders an on-screen terminal-like log.
- **`lightningcss` pinned to 1.30.1** in `package.json` `resolutions`.
- **OpenCode RAG** — this project uses `.opencode/rag_db` for semantic code search. Configuration is in `opencode-rag.json`. Do not commit API keys or the RAG database.

<!-- BEGIN opencode-rag -->
## Code Navigation

ALWAYS use OpenCodeRAG tools before reading or editing:
- **Search first** — `search_semantic(query)` instead of grep/glob
- **Skeleton before read** — `get_file_skeleton(filePath)` then read specific lines
- **Usages before edit** — `find_usages(symbolName)` before modifying any symbol
- **Images via describe** — `describe_image(filePath, systemPrompt?)` — never read raw bytes
- **Recall quirks** — `recall_quirks(query)` when you hit a known pitfall
- **Add quirks** — `add_quirk(content)` when you discover a non-obvious fact
- **Fix quirks** — `update_quirk(id, ...)` / `delete_quirk(id)` when a stored quirk is outdated or wrong

If no results, run `opencode-rag index`.

### Decision tree — ALWAYS follow this order
1. User mentions code behavior/architecture → `search_semantic(query)`
2. User mentions a file path → `get_file_skeleton(filePath)` THEN `read` on specific lines
3. User mentions a function/class/variable to edit → `find_usages(symbolName)` THEN `search_semantic` THEN `edit`
4. User asks a code question → `search_semantic` to gather context before answering
5. User asks about an image or visual asset → `describe_image(filePath)` (optionally pass `systemPrompt` to focus on specific features) to retrieve its generated description, then optionally `search_semantic` for related code
6. You encounter an error or need to recall a known pitfall → `recall_quirks(query)`
7. You discover a non-obvious fact or workaround → `add_quirk(content)` to persist it for future sessions
8. A recalled quirk is outdated or wrong → `update_quirk(id, ...)` to fix it, or `delete_quirk(id)` if it no longer applies

### Proactive triggers — you MUST call these tools when
- User asks about code behavior, architecture, or implementation details
- User asks to edit, refactor, or fix code — call `find_usages` first
- User references files or functions you haven't read yet
- User says "find", "search", "look up", "where is", "how does"
- User refers to an image, screenshot, diagram, or visual asset
- Before answering ANY code-related question, retrieve context first
- Before reading ANY file, call `get_file_skeleton` to orient first

### Anti-patterns — NEVER do these
- Reading full files without calling `get_file_skeleton` first (wastes tokens)
- Editing a function without calling `find_usages` first (breaks call sites)
- Answering code questions without calling `search_semantic` first (you guess at behavior)
- Using `grep`/`glob` when `search_semantic` would find the answer faster
- Treating image files as text — use `describe_image` instead of reading raw bytes
- Using `npx opencode-rag quirk` shell commands instead of the built-in quirk tools (`add_quirk` / `recall_quirks` / `update_quirk` / `delete_quirk`) (the tools are faster, already loaded in-process, and go through the trust monitor)

### MANDATORY quirk capture rules — you MUST call `add_quirk` when
- A build, test, or type-check command fails and you resolve it
- You discover an undocumented library constraint, peer dep, or workaround
- You learn an environment-specific requirement (OS, tool version, etc.)
- You make a design decision that future sessions should remember
- You resolve a gotcha that cost more than one attempt

### MANDATORY quirk hygiene — you MUST call `update_quirk` or `delete_quirk` when
- A stored quirk is outdated, wrong, or has been fixed — update it or delete it instead of adding a contradicting duplicate
- NEVER finish a coding session without adding quirks for resolved errors.
<!-- END opencode-rag -->
