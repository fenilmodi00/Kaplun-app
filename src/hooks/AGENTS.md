# src/hooks/ — Data Layer

6 hooks: the app's data-fetching layer. Appwrite TablesDB direct for CRUD state; FastAPI for Instagram operations. No React Query/SWR — plain `useState`/`useEffect` + manual `refresh` callbacks.

## STRUCTURE

| Hook | File | Backend | Realtime? | Returns |
|------|------|---------|-----------|---------|
| `useAuthFlow` | `useAuthFlow.ts` | Clerk | No | Auth state machine (signIn/signUp/OTP/Google) |
| `useDashboard` | `useDashboard.ts` | Appwrite | No | `{ data: {creator, threads, deals}, loading, error, refresh }` |
| `useThreads` | `useThreads.ts` | Appwrite | Yes (`deal_threads`) | `{ threads: ThreadWithPreview[], loading, error, refresh }` |
| `useMessages` | `useMessages.ts` | Appwrite | Yes (`messages` create) | `{ messages, loading, error, sendMessage, markAsRead, refresh }` |
| `useCreatorProfile` | `useCreatorProfile.ts` | Appwrite + FastAPI | No | `{ creator, dealThreads, recentReels, recentMedia, insights, isLoading, error, refresh }` |
| `useClayAnimations` | `useClayAnimations.ts` | — | — | `usePressAnimation`, `useShakeAnimation`, `useEntranceAnimation` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a CRUD data hook | Follow `useDashboard` pattern: `tablesDB.listRows()` + `Query.equal()` + `useState`/`useEffect` + `refresh` callback |
| Add realtime to a hook | Follow `useThreads`: `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` + `useRealtimeSubscription(channel, () => refetch())` |
| Add Instagram data to a hook | Follow `useCreatorProfile`: `fetchMedia(await getToken(), ...)` + `fetchInsights(...)` from `@/lib/instagram`; catch `'session_expired'` |
| Add a new animation | `useClayAnimations.ts` — add a new `useXAnimation` hook returning `{ animatedStyle, ... }` |

## CONVENTIONS

- **Appwrite direct for CRUD** — `tablesDB.listRows()` / `createRow()` / `updateRow()` with `Query.equal()` / `Query.orderDesc()` / `Query.limit()`. Never through FastAPI.
- **FastAPI for Instagram only** — `fetchMedia` / `fetchInsights` / `loginInstagram` / `fetchProfile` / `disconnectInstagram` from `@/lib/instagram`. Pass `await getToken()` as the JWT.
- **`clerkUserId` from `useUser()`** — `const { user } = useUser(); const clerkUserId = user?.id ?? ''`. Used as the Appwrite query key (`Query.equal('clerk_user_id', clerkUserId)`).
- **`cancelledRef` for unmount safety** — `useCreatorProfile` uses `cancelledRef = useRef(false)` + cleanup `() => { cancelledRef.current = true }` to prevent state updates after unmount.
- **`refresh` callback** — every hook returns a `refresh: () => Promise<void>` function that re-runs the fetch. Used by error retry buttons.
- **`'session_expired'` handling** — hooks check `err.message === 'session_expired'` (from FastAPI 401) and set `error: 'session_expired'` to trigger re-login UI.
- **Realtime channel pattern** — `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` for all rows, `.row('id')` for specific. Subscribe in `useEffect`, cleanup via the hook.
- **Error type** — `catch (err: unknown) { const apiErr = err as { message?: string }; setError(apiErr.message ?? 'Failed to load X') }`.

## ANTI-PATTERNS

- **NO React Query / SWR / tRPC** — plain hooks only. The app is small enough that manual caching isn't needed.
- **NO direct instagrapi calls** — Instagram data comes through `@/lib/instagram` → FastAPI → `SessionManager`.
- **NO `tablesDB` calls outside hooks** — screens call hooks, hooks call `tablesDB`. Keeps the data layer testable.
- **NO bare `catch {}`** — name the error (`catch (err: unknown)`).
