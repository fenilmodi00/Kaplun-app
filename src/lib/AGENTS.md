# src/lib/ — Infrastructure Layer

19 TypeScript modules + 2 JS web stubs: Appwrite client, typed repository, Clerk→Appwrite auth bridge, direct Instagram Graph client, automations engine client, React Query client/persister, resilience utilities, Realtime, fonts, polyfills, haptics, Reanimated web stubs.

## STRUCTURE

| File | Exports | Role |
|------|---------|------|
| `appwrite.ts` | `client`, `account`, `tablesDB`, `storage`, `realtime` | Appwrite SDK singleton. Reads `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. Uses `TablesDB` (NOT `Databases`). |
| `repository.ts` | `getCreatorByClerkId`, `listThreads`, `listMessages`, `sendMessage`, `batchMarkAsRead`, `listDeals`, `listPosts`, `getLastMessagePreviews` | Typed access layer over Appwrite TablesDB. Every call wrapped in `executeWithRetryAndTimeout()` (3 attempts, backoff + jitter, 15s timeout). |
| `resilient.ts` | `executeWithRetry()`, `executeWithTimeout()`, `executeWithRetryAndTimeout()` | Retry with exponential backoff + jitter, timeout wrapper, combined retry+timeout. Retries: network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 4xx auth/validation. |
| `auth-bridge.ts` | `createAppwriteSession(clerkToken)`, `ensureAppwriteSession(getToken)` | Clerk JWT → Gin api-go `/auth/appwrite-session` → `account.createSession`. 24h TTL fast-path; throws `bridge_failed` on failure. |
| `bridge-context.tsx` | `BridgeProvider`, `useBridge` | Appwrite session readiness. AuthGate mounts shell instantly; data hooks wait on `isReady`. Soft Retry on failure. |
| `query-client.ts` | `queryClient`, `persistOptions`, `shouldPersistQuery`, `PERSIST_MAX_AGE`, `PERSIST_BUSTER` | React Query singleton + AsyncStorage persister (24h maxAge, success-only dehydration). Global defaults `staleTime: 30_000`, `gcTime: 24h`, `retry: false`; hooks override `gcTime` to 5 min. |
| `automations.ts` | `createAutomation`, `listAutomations`, `updateAutomation`, `deleteAutomation`, `listAutomationLogs`, `listCampaignTemplates`, stats fns + `Automation`/`AutomationLog` types | Comment-automation engine client. Clerk Bearer to `EXPO_PUBLIC_IG_API_BASE_URL` (Gin api-go). 401/missing token → `session_expired`. |
| `automation-validation.ts` | `validateAutomationDraft(draft)`, `AutomationDraft` | Pure draft validation returning error strings; exported for unit tests without rendering. |
| `instagram.ts` | `fetchProfile`, `fetchMedia`, `fetchInsights`, `fetchAccountInsights`, `disconnectInstagram` + types (`InstagramProfileResponse`, `InstagramMediaResponse`, `InstagramInsightsResponse`, `InstagramAccountInsights`, `InsightPoint`) | Direct Instagram Graph API client (pinned **v22.0** — first version with Instagram-Login account insights; do not downgrade). Reads the per-user long-lived token from the `creators` row; on Meta error 190 runs `ig_refresh_token` and persists via `updateCreatorToken`. Throws `Error('session_expired')` when no usable token, `Error('insights_permission')` when the token predates the insights scope. 15s timeout. |
| `with-fresh-session.ts` | `withFreshSession(fn, getToken)` | **Dead code** — legacy recovery for the old ig-api-proxy; no app module imports it. Do not reintroduce the proxy. |
| `instagram-oauth.ts` | `startInstagramOAuth(clerkUserId, appwriteUserId)` | Instagram OAuth flow. Returns success/failure. Called from home screen's connect flow. |
| `realtime.ts` | `useRealtimeSubscription(channels, callback)` | Appwrite Realtime hook. Features: 2s debounce coalescing, exponential backoff reconnect (1s→30s), AppState foreground refetch. |
| `constants.ts` | `DATABASE_ID`, `TABLES`, `BUCKET_ID` | Hardcoded Appwrite IDs: `'vernacular_saas'` DB, tables `CREATORS`/`POSTS`/`DEAL_THREADS`/`MESSAGES`/`DEALS`, bucket `'attachments'`. |
| `types.ts` | `Creator`, `DealThread`, `Message`, `Deal`, `DealContext` | Appwrite document shapes. All have `$id?: string`. `Creator` has 43 fields. `Message.sender_type`: `creator\|agent\|brand\|system`. |
| `fonts.ts` | `useClayFonts()`, `CLAY_FONTS` | Loads Inter 400/500/600 via `@expo-google-fonts/inter`. Gates render in `AuthGate`. |
| `haptics.ts` | `hapticSelection()`, `hapticImpactLight()` | iOS-only haptics (`EXPO_OS === 'ios'` guard); errors swallowed by design. |
| `polyfills.ts` | — | `global.Buffer` from `buffer` npm pkg. Hooks global error handler via `hookGlobalErrors()`. Imported at `_layout.tsx:2`. |
| `logger.tsx` | `addLog`, `getLogs`, `subscribe`, `hookGlobalErrors`, `SplashLogger` | In-memory ring buffer (100 lines). `SplashLogger` renders dark terminal-like scroll view for startup debugging. |
| `reanimated-platform.ts` | `Reanimated`, `useSharedValue`, `useAnimatedStyle`, `IS_REANIMATED_AVAILABLE`, etc. | Platform-safe Reanimated. `IS_REANIMATED_AVAILABLE = Platform.OS !== 'web'`. Conditional require with no-op fallbacks. Always import this, NOT `react-native-reanimated`. |
| `reanimated-web-stub.js` | Full reanimated API as no-ops | Metro alias target for `react-native-reanimated` on web (#8285). |
| `worklets-web-stub.js` | `WorkletsModule`, `createSerializable`, etc. | Metro alias target for `react-native-worklets` on web (#8285). |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add an Appwrite table call | Add a typed function to `src/lib/repository.ts` using `tablesDB` + `DATABASE_ID`/`TABLES` wrapped in `executeWithRetryAndTimeout()` |
| Add a Gin backend call | `src/lib/automations.ts` — follow its Clerk Bearer + `executeWithRetry` + timeout pattern |
| Add a realtime subscription | `useRealtimeSubscription` from `@/lib/realtime` — `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` |
| Fix Reanimated web crash | `metro.config.js` aliases + `reanimated-web-stub.js` / `worklets-web-stub.js` |
| Debug startup crash | `logger.tsx` → `SplashLogger` (renders on-screen) |
| Add a new Appwrite table ID | `constants.ts` `TABLES` enum + `types.ts` for the shape |

## CONVENTIONS

- **TablesDB, not Databases** — `new TablesDB(client)` (Appwrite's document-store API). All reads/writes are document-based.
- **Repository pattern** — All Appwrite calls go through `@/lib/repository.ts`. Hooks never import `tablesDB` directly. Each repository function is wrapped with `executeWithRetryAndTimeout()`.
- **Resilience** — `executeWithRetry` (3 attempts, backoff + jitter), `executeWithTimeout` (15s), and `executeWithRetryAndTimeout`. Retries network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 400/401/403/404.
- **Instagram Graph API** — all Instagram calls go through `@/lib/instagram.ts` → `graph.instagram.com` directly, using the per-user long-lived token from the `creators` row. On Meta error 190 it runs `ig_refresh_token` and persists via `updateCreatorToken`. The old Appwrite ig-api-proxy is broken (Appwrite strips `x-appwrite-user-jwt`) — never reintroduce it.
- **`EXPO_PUBLIC_IG_API_BASE_URL`** — the Gin api-go server, Clerk Bearer auth. Used ONLY by `auth-bridge.ts` (`/auth/appwrite-session`) and `automations.ts` (`/automations/*`).
- **`session_expired` error convention** — Instagram token missing/unusable → `throw new Error('session_expired')` from `@/lib/instagram`. Hooks surface this as `error: 'session_expired'` for re-login UI.
- **Auth bridge is the only Appwrite seam** — the Gin api-go server never proxies Appwrite data ops; it only creates sessions (`/auth/appwrite-session`) and serves the automations engine (`/automations/*`). After `ensureAppwriteSession`, the app talks to Appwrite directly.
- **Reanimated imports** — always use `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly) for web safety.
- **Token cache** — uses Clerk's built-in `tokenCache from @clerk/expo/token-cache`. The old `@/lib/tokenCache` no longer exists.
- **`cancelledRef`** — used in home screen for unmount safety alongside React Query.

## ANTI-PATTERNS

- **NO `Databases` SDK** — use `TablesDB` only. The app never touches Appwrite's SQL Databases API.
- **NO direct `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO direct instagrapi / no proxy** — the app never imports instagrapi. All IG ops go through `src/lib/instagram.ts` → `graph.instagram.com` directly with the per-user token.
- **NO hardcoded Appwrite IDs outside `constants.ts`** — `DATABASE_ID` and `TABLES` enum are the single source of truth.
- **NO `account.createSession()` outside `auth-bridge.ts`** — the auth bridge is the only place Appwrite sessions are created.
- **NO `EXPO_PUBLIC_IG_API_PROXY_URL`** — the ig-api-proxy is dead; the app reads the token from the `creators` row and calls Graph API directly. `EXPO_PUBLIC_IG_API_BASE_URL` (Gin api-go) is used with Clerk Bearer only by the auth bridge and automations client.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform`.
