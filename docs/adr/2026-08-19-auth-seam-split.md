# ADR: Auth Seam — SignIn Ownership

**Date:** 2026-08-19
**Status:** Accepted

## Context

The auth seam has fuzzy ownership between `useAuthFlow` (which calls `account.createSession()`) and `SessionProvider` (which provides `signIn`). T10 of the architecture deepening plan evaluated whether `signIn` should move from `SessionProvider` into `useAuthFlow`.

## Decision

**Keep signIn in SessionProvider. Do not move it to useAuthFlow.**

## Rationale

The cold-boot restore path (`SessionProvider` → `restoreSession` → `setSession`) is fundamentally different from the signIn path:

1. **Cold-boot restore** runs on every launch: reads a persisted session secret from AsyncStorage, validates it in the background via `account.get()`, and sets the session if valid. No user interaction, no `createSession` call, no auth flow steps.

2. **signIn** runs after `useAuthFlow` completes OTP verification: it receives the session secret from `createSession`, persists it, sets the session, and fires `ensureProfile`. It is the terminal step of the auth flow.

3. **Merging them** would require `useAuthFlow` to handle both "create session then persist" (signIn) and "restore without creating" (cold boot) — two distinct behaviors that share only `persistSession` + `setSession`. The shared logic (~3 lines) does not justify the coupling of merging these two divergent callers.

4. **SessionProvider** is the natural home for both paths: it holds `setSession` state and already orchestrates cold-boot restore. Adding signIn as a sibling method keeps the module cohesive.

## Consequences

- `SessionProvider` remains the single module that owns session state lifecycle (restore, set, clear).
- `useAuthFlow` calls `SessionProvider.signIn()` via context after OTP verification — the context hook seam is preserved.
- The 3-line overlap (`persistSession` + `setSession` + `queryClient.invalidateQueries`) is acceptable duplication for keeping the two callers decoupled.
- `fireEnsureProfile` has already been migrated to the api-go client (T04), dissolving the raw-fetch dependency from `SessionProvider`.