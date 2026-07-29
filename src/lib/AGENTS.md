# src/lib/ — Infrastructure Layer

16 files: Appwrite client, typed repository, Clerk→Appwrite auth bridge, Instagram proxy client, resilience utilities, Realtime, fonts, polyfills, Reanimated web stubs.

## STRUCTURE

| File | Exports | Role |
|------|---------|------|
| `appwrite.ts` | `client`, `account`, `tablesDB`, `storage`, `realtime` | Appwrite SDK singleton. Reads `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. Uses `TablesDB` (NOT `Databases`). |
| `repository.ts` | `getCreatorByClerkId`, `listThreads`, `listMessages`, `sendMessage`, `batchMarkAsRead`, `listDeals`, `listPosts`, `getLastMessagePreviews` | Typed access layer over Appwrite TablesDB. Every call wrapped in `executeWithRetryAndTimeout()` (3 attempts, backoff + jitter, 15s timeout). |
| `resilient.ts` | `executeWithRetry()`, `executeWithTimeout()`, `executeWithRetryAndTimeout()` | Retry with exponential backoff + jitter, timeout wrapper, combined retry+timeout. Retries: network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 4xx auth/validation. |
| `auth-bridge.ts` | `createAppwriteSession(clerkToken)`, `ensureAppwriteSession(getToken)` | Clerk JWT → FastAPI `/auth/appwrite-session` → `account.createSession`. TTL fast-path; throws `bridge_failed` on failure. |
| `bridge-context.tsx` | `BridgeProvider`, `useBridge` | Appwrite session readiness. AuthGate mounts shell instantly; data hooks wait on `isReady`. Soft Retry on failure. |
| `instagram.ts` | `fetchProfile`, `fetchMedia`, `fetchInsights`, `disconnectInstagram` + types (`InstagramProfileResponse`, `InstagramMediaResponse`, `InstagramInsightsResponse`) | Appwrite ig-api-proxy client. Auth via `account.createJWT()` → `x-appwrite-user-jwt` header (NOT Clerk Bearer). Base URL from `EXPO_PUBLIC_IG_API_PROXY_URL`. 15s AbortController timeout. |
| `with-fresh-session.ts` | `withFreshSession(fn, getToken)` | Wraps Instagram calls: if `session_expired`, re-bridges Appwrite session then retries once. |
| `instagram-oauth.ts` | `startInstagramOAuth(clerkUserId, appwriteUserId)` | Instagram OAuth flow. Returns success/failure. Called from home screen's connect flow. |
| `realtime.ts` | `useRealtimeSubscription(channels, callback)` | Appwrite Realtime hook. Features: 2s debounce coalescing, exponential backoff reconnect (1s→30s), AppState foreground refetch. |
| `constants.ts` | `DATABASE_ID`, `TABLES`, `BUCKET_ID` | Hardcoded Appwrite IDs: `'vernacular_saas'` DB, tables `CREATORS`/`POSTS`/`DEAL_THREADS`/`MESSAGES`/`DEALS`, bucket `'attachments'`. |
| `types.ts` | `Creator`, `DealThread`, `Message`, `Deal`, `DealContext` | Appwrite document shapes. All have `$id?: string`. `Creator` has 43 fields. `Message.sender_type`: `creator\|agent\|brand\|system`. |
| `fonts.ts` | `useClayFonts()`, `CLAY_FONTS` | Loads Inter 400/500/600 via `@expo-google-fonts/inter`. Gates render in `AuthGate`. |
| `polyfills.ts` | — | `global.Buffer` from `buffer` npm pkg. Hooks global error handler via `hookGlobalErrors()`. Imported at `_layout.tsx:2`. |
| `logger.tsx` | `addLog`, `getLogs`, `subscribe`, `hookGlobalErrors`, `SplashLogger` | In-memory ring buffer (100 lines). `SplashLogger` renders dark terminal-like scroll view for startup debugging. |
| `reanimated-platform.ts` | `Reanimated`, `useSharedValue`, `useAnimatedStyle`, `IS_REANIMATED_AVAILABLE`, etc. | Platform-safe Reanimated. `IS_REANIMATED_AVAILABLE = Platform.OS !== 'web'`. Conditional require with no-op fallbacks. Always import this, NOT `react-native-reanimated`. |
| `reanimated-web-stub.js` | Full reanimated API as no-ops | Metro alias target for `react-native-reanimated` on web (#8285). |
| `worklets-web-stub.js` | `WorkletsModule`, `createSerializable`, etc. | Metro alias target for `react-native-worklets` on web (#8285). |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add an Appwrite table call | Add a typed function to `src/lib/repository.ts` using `tablesDB` + `DATABASE_ID`/`TABLES` wrapped in `executeWithRetryAndTimeout()` |
| Add a FastAPI backend call | `src/lib/instagram.ts` — follow the `fetchWithTimeout` + `getAuthHeaders` (Appwrite JWT) pattern |
| Add a realtime subscription | `useRealtimeSubscription` from `@/lib/realtime` — `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` |
| Fix Reanimated web crash | `metro.config.js` aliases + `reanimated-web-stub.js` / `worklets-web-stub.js` |
| Debug startup crash | `logger.tsx` → `SplashLogger` (renders on-screen) |
| Add a new Appwrite table ID | `constants.ts` `TABLES` enum + `types.ts` for the shape |

## CONVENTIONS

- **TablesDB, not Databases** — `new TablesDB(client)` (Appwrite's document-store API). All reads/writes are document-based.
- **Repository pattern** — All Appwrite calls go through `@/lib/repository.ts`. Hooks never import `tablesDB` directly. Each repository function is wrapped with `executeWithRetryAndTimeout()`.
- **Resilience** — `executeWithRetry` (3 attempts, backoff + jitter), `executeWithTimeout` (15s), and `executeWithRetryAndTimeout`. Retries network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 400/401/403/404.
- **Two separate API endpoints**:
  - `EXPO_PUBLIC_IG_API_BASE_URL` → FastAPI bridge (only creates Appwrite sessions). Clerk Bearer token auth.
  - `EXPO_PUBLIC_IG_API_PROXY_URL` → Appwrite ig-api-proxy cloud function (Instagram Graph API). Appwrite JWT auth (`x-appwrite-user-jwt` header).
- **`session_expired` error convention** — 401 from ig-api-proxy → `throw new Error('session_expired')`. Recovery via `withFreshSession(fn, getToken)` which re-bridges the Appwrite session and retries.
- **Auth bridge is the only seam** — FastAPI never proxies Appwrite data ops. It only creates sessions (`/auth/appwrite-session`). After `ensureAppwriteSession`, the app talks to Appwrite directly.
- **Reanimated imports** — always use `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly) for web safety.
- **Token cache** — uses Clerk's built-in `tokenCache from @clerk/expo/token-cache`. The old `@/lib/tokenCache` no longer exists.
- **`cancelledRef`** — used in home screen for unmount safety alongside React Query.

## ANTI-PATTERNS

- **NO `Databases` SDK** — use `TablesDB` only. The app never touches Appwrite's SQL Databases API.
- **NO direct `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO direct instagrapi** — the app never imports or calls instagrapi. All IG ops go through `src/lib/instagram.ts` → Appwrite ig-api-proxy cloud function.
- **NO hardcoded Appwrite IDs outside `constants.ts`** — `DATABASE_ID` and `TABLES` enum are the single source of truth.
- **NO `account.createSession()` outside `auth-bridge.ts`** — the auth bridge is the only place Appwrite sessions are created.
- **NO Clerk Bearer auth for IG proxy** — Instagram proxy uses Appwrite JWT (`x-appwrite-user-jwt`), not `Authorization: Bearer {clerkToken}`. The FastAPI bridge uses Clerk Bearer.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform`.
