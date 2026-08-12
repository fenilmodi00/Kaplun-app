# src/lib/ — Infrastructure Layer

21 TypeScript modules + 2 JS web stubs: Appwrite client, typed repository, direct Instagram Graph client, automations engine client, React Query client/persister, resilience utilities, Realtime, theme system, session context/persistence, fonts, polyfills, haptics, Reanimated web stubs.

## STRUCTURE

| File | Exports | Role |
|------|---------|------|
| `appwrite.ts` | `client`, `account`, `tablesDB`, `storage`, `realtime` | Appwrite SDK singleton. Reads `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. Uses `TablesDB` (NOT `Databases`). |
| `repository.ts` | `getCreatorByClerkId`, `listThreads`, `listMessages`, `sendMessage`, `batchMarkAsRead`, `listDeals`, `listPosts`, `getLastMessagePreviews` | Typed access layer over Appwrite TablesDB. Every call wrapped in `executeWithRetryAndTimeout()` (3 attempts, backoff + jitter, 15s timeout). |
| `resilient.ts` | `executeWithRetry()`, `executeWithTimeout()`, `executeWithRetryAndTimeout()` | Retry with exponential backoff + jitter, timeout wrapper, combined retry+timeout. Retries: network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 4xx auth/validation. |
| `bridge-context.tsx` | `BridgeProvider`, `useBridge` | Appwrite session readiness. AuthGate mounts shell instantly; data hooks wait on `isReady`. Soft Retry on failure. |
| `session-context.tsx` | `SessionProvider`, `useSession` | Appwrite session provider. Restores the session on launch via `auth-session`, exposes `signIn`/`signOut`, fire-and-forget calls Gin `POST /auth/ensure-profile` on restore/sign-in. |
| `auth-session.ts` | `restoreSession()`, `persistSession()`, `clearStoredSession()`, `getAppwriteJWT()`, `extractSessionSecret()` | The only session-persistence utilities (expo-secure-store). |
| `theme.ts` | `useThemePreference()`, `setThemePreference()`, `hydrateThemePreference()`, `useThemeScheme()`, `resolveScheme()` | Theme preference store (default `dark`, AsyncStorage key `@kaplun/theme-preference`) via `useSyncExternalStore` — NOT React context. `setThemePreference()` calls `Uniwind.setTheme()`. `useThemeScheme()` derives from `useThemeMode().mode` (PanelUI). `resolveScheme` ignores the OS scheme; web is always light. |
| `tab-bar-scroll.ts` | scroll pub/sub | Screens report scroll offset; `TabBar` subscribes to minimize on scroll. |
| `query-client.ts` | `queryClient`, `persistOptions`, `shouldPersistQuery`, `PERSIST_MAX_AGE`, `PERSIST_BUSTER` | React Query singleton + AsyncStorage persister (24h maxAge, success-only dehydration). Global defaults `staleTime: 30_000`, `gcTime: 24h`, `retry: false`; hooks override `gcTime` to 5 min. |
| `automations.ts` | `createAutomation`, `listAutomations`, `updateAutomation`, `deleteAutomation`, `listAutomationLogs`, `listCampaignTemplates`, stats fns + `Automation`/`AutomationLog` types | Comment-automation engine client. Appwrite JWT Bearer to `EXPO_PUBLIC_IG_API_BASE_URL` (Gin api-go). 401/missing token → `session_expired`. |
| `automation-validation.ts` | `validateAutomationDraft(draft)`, `AutomationDraft` | Pure draft validation returning error strings; exported for unit tests without rendering. |
| `instagram.ts` | `fetchProfile`, `fetchMedia`, `fetchInsights`, `fetchAccountInsights`, `disconnectInstagram` + types (`InstagramProfileResponse`, `InstagramMediaResponse`, `InstagramInsightsResponse`, `InstagramAccountInsights`, `InsightPoint`) | Direct Instagram Graph API client (pinned **v26.0** — latest Graph API; Instagram-Login account insights require v22.0+, satisfied). Reads the per-user long-lived token from the `creators` row; on Meta error 190 runs `ig_refresh_token` and persists via `updateCreatorToken`. Throws `Error('session_expired')` when no usable token, `Error('insights_permission')` when the token predates the insights scope. 15s timeout. |
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
| Add a Gin backend call | `src/lib/automations.ts` — follow its Appwrite JWT Bearer + `executeWithRetry` + timeout pattern |
| Add a realtime subscription | `useRealtimeSubscription` from `@/lib/realtime` — `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` |
| Fix Reanimated web crash | `metro.config.js` aliases + `reanimated-web-stub.js` / `worklets-web-stub.js` |
| Debug startup crash | `logger.tsx` → `SplashLogger` (renders on-screen) |
| Add a new Appwrite table ID | `constants.ts` `TABLES` enum + `types.ts` for the shape |

## CONVENTIONS

- **TablesDB, not Databases** — `new TablesDB(client)` (Appwrite's document-store API). All reads/writes are document-based.
- **Repository pattern** — All Appwrite calls go through `@/lib/repository.ts`. Hooks never import `tablesDB` directly. Each repository function is wrapped with `executeWithRetryAndTimeout()`.
- **Resilience** — `executeWithRetry` (3 attempts, backoff + jitter), `executeWithTimeout` (15s), and `executeWithRetryAndTimeout`. Retries network errors, HTTP 429/5xx, Appwrite code ≥ 500. Never retries 400/401/403/404.
- **Instagram Graph API** — all Instagram calls go through `@/lib/instagram.ts` → `graph.instagram.com` directly, using the per-user long-lived token from the `creators` row. On Meta error 190 it runs `ig_refresh_token` and persists via `updateCreatorToken`. The old Appwrite ig-api-proxy is broken (Appwrite strips `x-appwrite-user-jwt`) — never reintroduce it.
- **`EXPO_PUBLIC_IG_API_BASE_URL`** — the Gin api-go server, Appwrite JWT Bearer auth. Used ONLY by `automations.ts` (`/automations/*`).
- **`session_expired` error convention** — Instagram token missing/unusable → `throw new Error('session_expired')` from `@/lib/instagram`. Hooks surface this as `error: 'session_expired'` for re-login UI.
- **Auth session lives in `auth-session.ts`** — `restoreSession()`, `persistSession()`, `clearStoredSession()`, and `getAppwriteJWT()` are the only session utilities. The app restores the Appwrite session on launch, then talks to Appwrite directly.
- **Reanimated imports** — always use `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly) for web safety.
- **Theme tokens live in `src/global.css`** — PanelUI `theme.css` defines the token palette; `src/global.css` adds the AMOLED dark `#000000` override via `@variant dark`. Use `useCSSVariable('--color-*')` from `@/tw` for raw-RN color access.
- **Token cache** — uses `expo-secure-store` for Appwrite session secret persistence. The old `@/lib/tokenCache` no longer exists.
- **`cancelledRef`** — used in home screen for unmount safety alongside React Query.

## ANTI-PATTERNS

- **NO `Databases` SDK** — use `TablesDB` only. The app never touches Appwrite's SQL Databases API.
- **NO direct `tablesDB.listRows()` outside `repository.ts`** — all Appwrite queries go through typed repository functions.
- **NO direct instagrapi / no proxy** — the app never imports instagrapi. All IG ops go through `src/lib/instagram.ts` → `graph.instagram.com` directly with the per-user token.
- **NO hardcoded Appwrite IDs outside `constants.ts`** — `DATABASE_ID` and `TABLES` enum are the single source of truth.
- **NO `account.createSession()` outside `useAuthFlow`** — `useAuthFlow` (in `src/hooks/useAuthFlow.ts`) is the only place Appwrite sessions are created.
- **NO `EXPO_PUBLIC_IG_API_PROXY_URL`** — the ig-api-proxy is dead; the app reads the token from the `creators` row and calls Graph API directly. `EXPO_PUBLIC_IG_API_BASE_URL` (Gin api-go) is used with Appwrite JWT Bearer by the automations client.
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform`.
