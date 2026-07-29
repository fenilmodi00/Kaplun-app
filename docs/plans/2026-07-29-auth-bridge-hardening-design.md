# Auth Bridge Hardening — Design Doc

**Date:** 2026-07-29  
**Status:** Approved (brainstorming complete)  
**Constraint:** Keep Clerk Pro + custom Auth UI + Appwrite Pro. No Supabase.

---

## 1. Goal

Make Clerk → Appwrite login/startup **less fragile and easier to reason about** without changing the three-system architecture. Cold start after Clerk sign-in must never mount the main app before an Appwrite session exists.

## 2. Context

### Why the bridge exists

Appwrite has no native Clerk JWT passthrough (unlike Supabase’s third-party Clerk auth). The supported Appwrite pattern for external IdPs is: verify Clerk on the server → mint an Appwrite custom token → client `account.createSession()`. That is what we already do via FastAPI `POST /auth/appwrite-session`.

### Current pain

- **A)** Startup feels fragile/slow — bridge races with screen data loads.
- **B)** Mental complexity — two tokens + Instagram sessions without a hard gate.

### Verified bug

`AuthGate` (`src/app/_layout.tsx`) fires `ensureAppwriteSession` in a background `useEffect` but immediately renders `<Slot />` when Clerk reports signed-in. Tabs/hooks can call TablesDB before the Appwrite session is ready.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Architecture | Keep Approach 1: harden the bridge | Uses both Pros; keeps client Realtime + direct TablesDB |
| Rejected | Supabase for “user data” only | Adds a 4th system; Appwrite bridge still required |
| Rejected | Drop Clerk / use Appwrite Auth | Clerk Pro + custom UI are keepers |
| Rejected | Full BFF (all DB via FastAPI) | Loses client Realtime; large rewrite |
| Bridge host | Stay on FastAPI for this pass | Working; optional Appwrite Function move is later |
| Auth UI | Untouched | Custom Clerk UI stays |

## 4. Mental model (permanent)

| System | Owns | Token the app uses |
|--------|------|--------------------|
| **Clerk** | Login UI, identity | Clerk JWT |
| **Appwrite** | Creators, threads, messages, deals, Realtime | Appwrite session (after bridge) |
| **FastAPI** | Instagram proxy + session mint | Verifies Clerk JWT |

```text
Sign-in (Clerk)
  → Clerk JWT
  → POST /auth/appwrite-session
  → account.createSession()
  → TablesDB + Realtime directly
  → Instagram calls still use Clerk JWT only
```

**Rule:** Clerk = who. Appwrite = what data. FastAPI = Instagram + mint the Appwrite ticket.

## 5. Startup gate (instant shell)

### AuthGate states

| State | UI |
|-------|-----|
| fonts / Clerk loading | brief spinner (boot only) |
| not signed in | custom `AuthScreen` |
| signed in, bridging | **mount tabs immediately** + screen skeletons; hooks wait on `BridgeContext.isReady` |
| bridge ready | data paints into existing shell |
| bridge failed after retries | soft banner + Retry (shell stays mounted) |

### Flow

```text
Clerk signed-in
  → mount app shell immediately (no Connecting wall)
  → ensureAppwriteSession(getToken) in parallel  // 24h TTL fast-path
  → hooks/queries enabled only when bridge ready
  → on failure: soft Retry banner (3× exponential backoff)
```

### Unchanged

- `ensureAppwriteSession` TTL, parallel delete/create, FastAPI mint
- Instagram path: Clerk JWT → FastAPI; `withFreshSession` for IG recovery

## 6. Cleanup

1. Keep `auth-bridge.ts` + `POST /auth/appwrite-session` as the only Clerk↔Appwrite seam; document in AGENTS.md.
2. Split error meanings:
   - Bridge fail → `bridge_failed` (AuthGate Retry)
   - Instagram disconnected → keep `session_expired` (reconnect IG)
3. `addLog()` on bridge start / fast-path / success / fail.
4. Tests: block Slot until ready; show Retry on persistent failure.

## 7. Out of scope

- Supabase
- Dropping Clerk or rewriting Auth UI
- BFF / proxying all TablesDB through FastAPI
- Migrating Realtime off Appwrite
- Changing Instagram OAuth / SessionManager
- Moving mint to Appwrite Function (optional later)

## 8. Success criteria

- Cold open after Clerk sign-in never flashes empty dashboards from a missing Appwrite session.
- User never waits on a full-screen “Connecting…” / lag spinner after sign-in — shell + skeletons only.
- One diagram + AuthGate state machine is enough to debug auth.
- Existing bridge performance characteristics (TTL fast-path) preserved.
