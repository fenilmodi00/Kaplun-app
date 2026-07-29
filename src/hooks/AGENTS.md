# src/hooks/ — Data Layer

6 hooks: the app's data-fetching layer. All use `@tanstack/react-query` (useQuery/useMutation/useQueries) against `@/lib/repository` for Appwrite CRUD and `@/lib/instagram` for Instagram operations.

## STRUCTURE

| Hook | File | Backend | React Query | Realtime? | Returns |
|------|------|---------|-------------|-----------|---------|
| `useAuthFlow` | `useAuthFlow.ts` | Clerk | No | No | Auth state machine (signIn/signUp/OTP/Google) |
| `useDashboard` | `useDashboard.ts` | Appwrite via `@/lib/repository` | `useQuery` | No | `{ data: {creator, threads, deals}, loading, error, refresh }` |
| `useThreads` | `useThreads.ts` | Appwrite via `@/lib/repository` | `useQuery` | Yes (`deal_threads`) | `{ threads: ThreadWithPreview[], loading, error, refresh }` |
| `useMessages` | `useMessages.ts` | Appwrite via `@/lib/repository` | `useQuery` + `useMutation` | Yes (`messages` create) | `{ messages, loading, error, sendMessage, markAsRead, refresh }` |
| `useCreatorProfile` | `useCreatorProfile.ts` | Appwrite + Instagram proxy | `useQueries` (parallel) | No | `{ creator, dealThreads, recentReels, recentMedia, insights, isLoading, error, refresh }` |
| `useClayAnimations` | `useClayAnimations.ts` | — | No | — | `usePressAnimation`, `useShakeAnimation`, `useEntranceAnimation` |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a CRUD data hook | Follow `useDashboard` or `useThreads`: `useQuery({ queryKey, queryFn: () => repositoryFn(...), staleTime, gcTime })` |
| Add a write mutation | Follow `useMessages`: `useMutation({ mutationFn, onSuccess: (r) => queryClient.setQueryData(...) })` |
| Add realtime to a hook | Follow `useThreads`: `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` + `useRealtimeSubscription(channel, () => queryClient.invalidateQueries(...))` |
| Add Instagram proxy data | Follow `useCreatorProfile`: `useQuery({ queryKey, queryFn: () => withFreshSession(() => fetchMedia(), getToken) })` |
| Add a new animation | `useClayAnimations.ts` — add a new `useXAnimation` hook returning `{ animatedStyle, ... }` |

## CONVENTIONS

- **React Query for all data** — `useQuery` for reads, `useMutation` for writes, `useQueryClient` for invalidation/setQueryData. `staleTime: 30_000`, `gcTime: 5 * 60_000`, `retry: false` in all hooks. Gate Appwrite queries with `enabled: !!clerkUserId && useBridge().isReady`.
- **Appwrite via `@/lib/repository`** — hooks never call `tablesDB` directly. All Appwrite operations go through typed repository functions (e.g. `getCreatorByClerkId`, `listThreads`, `listMessages`, `sendMessage`).
- **Instagram via `@/lib/instagram` + `withFreshSession`** — `fetchMedia`, `fetchInsights`, `fetchProfile` from `@/lib/instagram`. Wrap with `withFreshSession(fn, getToken)` for session-expiry recovery.
- **`clerkUserId` from `useUser()`** — `const { user } = useUser(); const clerkUserId = user?.id ?? ''`. Used as the query key discriminator and passed to repository functions.
- **`refresh` callback** — every hook returns `refresh: () => void` that calls `queryClient.invalidateQueries({ queryKey: [...] })`. Provided for backward compat and error retry buttons.
- **`'session_expired'` handling** — Instagram proxy 401 → `throw new Error('session_expired')`. Hooks surface this as `error: 'session_expired'` to trigger re-login UI.
- **Realtime invalidation pattern** — `useRealtimeSubscription(channel, () => queryClient.invalidateQueries({ queryKey: [...] }))`. Subscribe once, invalidate on any event.
- **Optimistic cache updates** — `useMutation.onSuccess: (result) => queryClient.setQueryData(queryKey, (prev) => [...prev, result])`. See `useMessages` for the pattern.

## ANTI-PATTERNS

- **NO direct `tablesDB` calls** — Appwrite queries go through repository functions only.
- **NO `useState`/`useEffect` fetch loops** — React Query handles loading/error/refetch lifecycle. The old `cancelledRef` pattern is only present in `useCreatorProfile` for legacy safety.
- **NO bare `catch {}`** — name the error (`catch (err: unknown)`).
- **NO direct Fetch/AbortController** — use `executeWithRetryAndTimeout` from `@/lib/resilient` (wrapped in repository functions).
- **NO direct instagrapi/Instagram calls** — Instagram data comes through `@/lib/instagram` → Appwrite ig-api-proxy cloud function.
