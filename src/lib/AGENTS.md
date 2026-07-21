# src/lib/ — Infrastructure Layer

13 files: Appwrite client, Clerk→Appwrite auth bridge, FastAPI client, Realtime, fonts, polyfills, Reanimated web stubs.

## STRUCTURE

| File | Exports | Role |
|------|---------|------|
| `appwrite.ts` | `client`, `account`, `tablesDB`, `storage`, `realtime` | Appwrite SDK singleton. Reads `EXPO_PUBLIC_APPWRITE_ENDPOINT` + `EXPO_PUBLIC_APPWRITE_PROJECT_ID`. Uses `TablesDB` (NOT `Databases`). |
| `auth-bridge.ts` | `createAppwriteSession(clerkToken)` | Clerk JWT → FastAPI `/auth/appwrite-session` → `account.createSession({userId, secret})`. The ONLY place the two backends meet. |
| `instagram.ts` | `loginInstagram`, `fetchProfile`, `fetchMedia`, `fetchInsights`, `disconnectInstagram` + types | FastAPI client. `getAuthHeaders()` → `Authorization: Bearer ${clerkToken}`. 15s `AbortController` timeout. 401 → throws `'session_expired'`. |
| `realtime.ts` | `useRealtimeSubscription(channels, callback)` | Appwrite Realtime hook. Ref-based callback (no re-subscribe on identity change). Cleanup on unmount. |
| `constants.ts` | `DATABASE_ID`, `TABLES`, `BUCKET_ID` | Hardcoded Appwrite IDs: `'vernacular_saas'` DB, tables `CREATORS`/`POSTS`/`DEAL_THREADS`/`MESSAGES`/`DEALS`, bucket `'attachments'`. |
| `types.ts` | `Creator`, `DealThread`, `Message`, `Deal`, `DealContext` | Appwrite document shapes. All have `$id?: string`. `Creator` has 43 fields. `Message.sender_type`: `creator|agent|brand|system`. |
| `tokenCache.ts` | `secureTokenCache` | Clerk `TokenCache` via `expo-secure-store`. Silent fallback on web/simulators. |
| `fonts.ts` | `useClayFonts()`, `CLAY_FONTS` | Loads Inter 400/500/600 via `@expo-google-fonts/inter`. Gates render in `AuthGate`. |
| `polyfills.ts` | — | `global.Buffer` from `buffer` npm pkg. Hooks global error handler via `hookGlobalErrors()`. Imported at `_layout.tsx:2`. |
| `logger.tsx` | `addLog`, `getLogs`, `subscribe`, `hookGlobalErrors`, `SplashLogger` | In-memory ring buffer (100 lines). `SplashLogger` renders dark terminal-like scroll view for startup debugging. |
| `reanimated-platform.ts` | `Reanimated`, `useSharedValue`, `useAnimatedStyle`, `IS_REANIMATED_AVAILABLE`, etc. | Platform-safe Reanimated. `IS_REANIMATED_AVAILABLE = Platform.OS !== 'web'`. Conditional require with no-op fallbacks. |
| `reanimated-web-stub.js` | Full reanimated API as no-ops | Metro alias target for `react-native-reanimated` on web (#8285). |
| `worklets-web-stub.js` | `WorkletsModule`, `createSerializable`, etc. | Metro alias target for `react-native-worklets` on web (#8285). |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add an Appwrite table call | Use `tablesDB` from `@/lib/appwrite` + `DATABASE_ID`/`TABLES` from `@/lib/constants` |
| Add a FastAPI backend call | `src/lib/instagram.ts` — follow the `fetchWithTimeout` + `getAuthHeaders` pattern |
| Add a realtime subscription | `useRealtimeSubscription` from `@/lib/realtime` — `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` |
| Fix Reanimated web crash | `metro.config.js` aliases + `reanimated-web-stub.js` / `worklets-web-stub.js` |
| Debug startup crash | `logger.tsx` → `SplashLogger` (renders on-screen) |
| Add a new Appwrite table ID | `constants.ts` `TABLES` enum + `types.ts` for the shape |

## CONVENTIONS

- **TablesDB, not Databases** — `new TablesDB(client)` (Appwrite's document-store API). All reads/writes are document-based.
- **Auth bridge is the only seam** — FastAPI never proxies Appwrite data ops. It only creates sessions (`/auth/appwrite-session`) + proxies Instagram. After `createAppwriteSession`, app talks to Appwrite directly.
- **JWT Bearer everywhere** — every FastAPI call: `Authorization: Bearer ${clerkToken}` where `clerkToken` comes from Clerk's `getToken()`.
- **15s fetch timeout** — `AbortController` in `instagram.ts:38-49`.
- **`'session_expired'` error convention** — 401 from FastAPI → throw `new Error('session_expired')`. Hooks check `err.message === 'session_expired'` to show re-login UI.
- **Reanimated imports** — use `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly) for web safety.

## ANTI-PATTERNS

- **NO `Databases` SDK** — use `TablesDB` only. The app never touches Appwrite's SQL Databases API.
- **NO direct instagrapi** — the app never imports or calls instagrapi. All IG ops go through `src/lib/instagram.ts` → FastAPI → `SessionManager`.
- **NO hardcoded Appwrite IDs outside `constants.ts`** — `DATABASE_ID` and `TABLES` enum are the single source of truth.
- **NO `account.createSession()` outside `auth-bridge.ts`** — the auth bridge is the only place Appwrite sessions are created.
