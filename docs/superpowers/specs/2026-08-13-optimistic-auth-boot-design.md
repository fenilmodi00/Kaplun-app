# Optimistic Auth Boot Design

**Date:** 2026-08-13
**Status:** Ready for implementation
**Supersedes:** `.omo/plans/offline-first-p0.md` (2026-08-11) — that plan is rewritten to match this spec
**Branch:** current working branch

## Summary

Cold start must paint the last authenticated screen from local state. The Appwrite session secret already lives in SecureStore; React Query already persists screen data to AsyncStorage. The 1–2s spinner exists because `SessionProvider` sets `isLoading = true` until `restoreSession()` **awaits** `account.get()`. That network call must move off the first-paint path.

Pattern: Expo `with-clerk` — `tokenCache` + `Stack.Protected` on local `isSignedIn`. Validate with the server in the background. On a real 401, kick to sign-in immediately.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| First paint | Trust SecureStore secret; do not await `account.get()` | Cuts the 1–2s spinner |
| Background login check | Yes — `account.get()` after tabs mount | User chose silent refresh, not “never check” |
| Real 401/403 | Sign out immediately (clear store, `session = null`) | User chose kick-to-sign-in, not a banner |
| Network / timeout / 5xx | Keep session and cache | Offline users must not be logged out |
| Query keys | Persist `appwrite-user` | Hooks key on `userId`; skipping this query made cache lookups `['dashboard', '']` |
| Fonts | Keep Inter via `@expo-google-fonts/inter` | Bundled, not a network download; not the 1–2s delay |
| Data hooks | Unchanged | `staleTime: 30_000` already background-refetches; `isLoading` is false when cache exists |
| NetInfo / focus | Already wired in `src/app/_layout.tsx` | Do not re-install or re-wire |

## Boot sequence

1. `PersistQueryClientProvider` restores the React Query cache (including `appwrite-user` after this change).
2. `restoreSession()` reads SecureStore, calls `client.setSession(secret)`, returns the secret. **No** `account.get()`. **No** delete on read failure except a missing key.
3. `SessionProvider` sets `session` and `isLoading = false`.
4. Root layout: spinner only while Inter registers **or** the SecureStore read is in flight. Then `Stack.Protected` mounts `(tabs)` when `session` is set.
5. Screens read cached `userId` and cached queries; UI shows last data. Queries with `staleTime: 30_000` refetch in the background (`isFetching`, not full-screen `isLoading`).
6. Background: `account.get()`. Success → `fireEnsureProfile()` (unchanged, fire-and-forget). 401/403 → `clearStoredSession()`, `setSession(null)`, `queryClient.clear()`. Network error → log, keep session.

`useAppwriteUser` keeps `staleTime: Infinity`. After the user query is persisted, it does not refetch on mount; the session provider’s background `account.get()` is the login check. On the first launch after this ships (no persisted user yet), `useAppwriteUser` may also call `account.get()` once to fill `userId` — acceptable; later launches are cache hits.

## `restoreSession()` contract

**Before:** setSession → await `account.get()` → on any error delete secret and return null.

**After:** setSession from stored secret → return secret. Delete the secret only when the caller decides the session is invalid (401 path in `SessionProvider`).

Export `isNetworkError(err)` from `auth-session.ts` (TypeError, AbortError, Appwrite `code >= 500`). `SessionProvider` uses it to distinguish 401 from offline.

## Persistence

In `src/lib/query-client.ts`, remove the `queryKey[0] === 'appwrite-user'` dehydrate skip. Successful `appwrite-user` queries persist like other success queries (`shouldPersistQuery`). Flip the existing unit test from “never persist” to “persist when status is success”.

Do not bump `PERSIST_BUSTER` — adding a query to dehydrate does not invalidate existing screen caches.

## Root layout

Keep Inter via `useClayFonts()`. Keep NetInfo `onlineManager` and AppState `focusManager`. Change only the meaning of `isLoading`: it is “local session not read yet”, not “server has confirmed the session”.

`setStatus(isLoading ? 'bridging' : 'ready')` stays. Ready as soon as the local session is applied so hooks’ `enabled: !!appwriteUserId && isReady` can use cached `userId`.

## Error handling

| Failure | UI | Storage |
|---------|----|---------|
| No secret | Sign-in | Unchanged |
| SecureStore read throws | Sign-in (treat as no session) | Do not crash |
| Background `account.get()` 401/403 | Immediate sign-in | Delete secret, clear RQ cache |
| Background `account.get()` network/5xx | Stay on tabs, cached data | Keep secret |
| Screen query fails while offline | Existing hook error/empty behavior | Cache kept |

## Testing

- `isNetworkError` table tests.
- `restoreSession` does not call `account.get()`; returns secret; does not delete on store hit.
- Optimistic boot: secret present + `account.get()` never resolves → authenticated UI (not spinner).
- 401 → sign-in. TypeError → stay authenticated.
- `shouldDehydrateQuery` allows successful `appwrite-user`.
- Existing `auth-gate` / `auth-session` tests updated for the new `restoreSession` contract.

## Non-goals

- System fonts / removing Inter.
- Changing per-hook `staleTime` / `gcTime`.
- Backend (`api-go`) changes.
- Storing `{ secret, userId }` as a second identity blob in SecureStore.
- Skipping `account.get()` entirely (user chose silent background check).
- New UI (banners, offline toasts).
- Re-wiring NetInfo (already done).

## Files

| File | Change |
|------|--------|
| `src/lib/auth-session.ts` | Local-only restore; export `isNetworkError` |
| `src/lib/session-context.tsx` | Optimistic boot; background validate |
| `src/lib/query-client.ts` | Persist `appwrite-user` |
| `src/lib/query-client.test.ts` | Expect persist on success |
| `src/lib/auth-session.test.ts` | Restore + `isNetworkError` |
| `src/lib/session-context` tests or `src/testing/offline-boot.test.tsx` | Optimistic boot + 401 vs network |
| `src/app/_layout.tsx` | No NetInfo work; spinner still fonts + local `isLoading` only |
