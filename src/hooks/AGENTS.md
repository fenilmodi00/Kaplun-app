# src/hooks/ — Data Layer

10 hooks: the app's data-fetching layer. All use `@tanstack/react-query` (useQuery/useMutation/useQueries) against `@/lib/repository` for Appwrite CRUD and `@/lib/instagram` for Instagram operations.

## STRUCTURE

| Hook | File | Backend | React Query | Realtime? | Returns |
|------|------|---------|-------------|-----------|---------|
| `useAuthFlow` | `useAuthFlow.ts` | Appwrite | No | No | Auth state machine (signIn/signUp/OTP/Google); the ONLY place `account.createSession()` runs |
| `useAppwriteUser` | `useAppwriteUser.ts` | Appwrite `account` | `useQuery` (`appwrite-user` key; never persisted) | No | `{ data: user }` — the source of `appwriteUserId` consumed by all data hooks |
| `useDashboard` | `useDashboard.ts` | Appwrite via `@/lib/repository` | `useQuery` | No | `{ data: {creator, threads, deals}, loading, error, refresh }` |
| `useThreads` | `useThreads.ts` | Appwrite via `@/lib/repository` | `useQuery` | Yes (`deal_threads`) | `{ threads: ThreadWithPreview[], loading, error, refresh }` |
| `useMessages` | `useMessages.ts` | Appwrite via `@/lib/repository` | `useQuery` + `useMutation` | Yes (`messages` create) | `{ messages, loading, error, sendMessage, markAsRead, refresh }` |
| `useCreatorProfile` | `useCreatorProfile.ts` | Appwrite via `@/lib/repository` + Instagram via `@/lib/instagram` | `useQueries` (parallel) | No | `{ creator, dealThreads, recentReels, recentMedia, insights, isLoading, error, refresh }` |
| `useInsights` | `useInsights.ts` | Instagram via `@/lib/instagram` (`fetchProfile` + `fetchAccountInsights` + `fetchMedia`) | `useQueries` (parallel) | No | `{ profile, insights, topMedia, isLoading, error, refresh }`; takes `windowDays` (7/28), surfaces `'session_expired'` / `'insights_permission'` |
| `useAutomations` | `useAutomations.ts` | Gin api-go via `@/lib/automations` | `useQuery` + `useMutation` | No | Automations CRUD + `useOverviewStats` / `useAutomationLogs` / `useAutomationStats` |
| `useAutomationGate` | `useAutomationGate.ts` | Instagram OAuth | `useQuery` + `useMutation` | No | `{ connected, loading, connect }` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a CRUD data hook | Follow `useDashboard` or `useThreads`: `useQuery({ queryKey, queryFn: () => repositoryFn(...), staleTime, gcTime })` |
| Add a write mutation | Follow `useMessages`: `useMutation({ mutationFn, onSuccess: (r) => queryClient.setQueryData(...) })` |
| Add realtime to a hook | Follow `useThreads`: `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` + `useRealtimeSubscription(channel, () => queryClient.invalidateQueries(...))` |
| Add Instagram data | Follow `useCreatorProfile`: `useQuery({ queryKey, queryFn: () => fetchMedia(), staleTime, gcTime, retry: false })` — Instagram calls go through `@/lib/instagram` directly (no `withFreshSession`, no proxy) |

## CONVENTIONS

- **React Query for all data** — `useQuery` for reads, `useMutation` for writes, `useQueryClient` for invalidation/setQueryData. `staleTime: 30_000`, `gcTime: 5 * 60_000`, `retry: false` in all hooks. Gate Appwrite queries with `enabled: !!appwriteUserId && useBridge().isReady`.
- **Appwrite via `@/lib/repository`** — hooks never call `tablesDB` directly. All Appwrite operations go through typed repository functions (e.g. `getCreatorByAppwriteId`, `listThreads`, `listMessages`, `sendMessage`).
- **Instagram via `@/lib/instagram`** — `fetchMedia`, `fetchInsights`, `fetchProfile` from `@/lib/instagram` (direct Graph API with the per-user token; no `withFreshSession` wrapper needed).
- **`appwriteUserId` from `useAppwriteUser()`** — `const { data: user } = useAppwriteUser(); const appwriteUserId = user?.$id ?? ''`. Used as the query key discriminator and passed to repository functions.
- **`refresh` callback** — every hook returns `refresh: () => void` that calls `queryClient.invalidateQueries({ queryKey: [...] })`. Provided for backward compat and error retry buttons.
- **`'session_expired'` handling** — Instagram token missing/unusable → `throw new Error('session_expired')` from `@/lib/instagram`. Hooks surface this as `error: 'session_expired'` to trigger re-login UI.
- **Realtime invalidation pattern** — `useRealtimeSubscription(channel, () => queryClient.invalidateQueries({ queryKey: [...] }))`. Subscribe once, invalidate on any event.
- **Optimistic cache updates** — `useMutation.onSuccess: (result) => queryClient.setQueryData(queryKey, (prev) => [...prev, result])`. See `useMessages` for the pattern.

## ANTI-PATTERNS

- **NO direct `tablesDB` calls** — Appwrite queries go through repository functions only.
- **NO `useState`/`useEffect` fetch loops** — React Query handles loading/error/refetch lifecycle. The old `cancelledRef` pattern is only present in `useCreatorProfile` for legacy safety.
- **NO bare `catch {}`** — name the error (`catch (err: unknown)`).
- **NO direct Fetch/AbortController** — use `executeWithRetryAndTimeout` from `@/lib/resilient` (wrapped in repository functions).
- **NO direct instagrapi/proxy calls** — Instagram data comes through `@/lib/instagram` (direct Graph API with the per-user token), never instagrapi or a proxy.
