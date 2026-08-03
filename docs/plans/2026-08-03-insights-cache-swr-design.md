# Insights Cache + Toggle Fix — Design

**Date:** 2026-08-03
**Status:** Approved by user (2026-08-03)
**Scope:** `src/app/_layout.tsx`, `src/hooks/useInsights.ts`, `src/app/(tabs)/(insights)/index.tsx`, tests

## Problem

1. **Cold-start skeleton every launch.** The `QueryClient` in `_layout.tsx` is
   in-memory only (`staleTime 30s`, `gcTime 5min`). Every cold start begins with
   an empty cache, so the Insights screen (and every other screen) shows its
   skeleton and fires fresh Meta Graph API calls.
2. **7D/28D toggle eats presses.** Changing `windowDays` changes the query key;
   the new key has no cached data → `isLoading` flips true → the whole screen,
   **including the header containing the toggle**, unmounts to the skeleton.
   Mid-gesture presses die with the unmounted Pressable; presses on the skeleton
   hit nothing. Refetch windows (30s staleTime) and bridge status flickers make
   the swap land under the user's finger — hence "press 10–12 times".

## Decision (user-approved)

**Approach A — TanStack official persistence** over:
- B: hand-rolled AsyncStorage snapshot (duplicates React Query, single-screen fix)
- C: MMKV (not Expo Go compatible; this project's OAuth flow targets Expo Go)
- D: server-side insights cache in Appwrite (YAGNI for now)
- Zustand persist (second state paradigm for no gain)

## Design

### 1. Persistence layer (`src/app/_layout.tsx`)

- New deps (via `expo install` for SDK alignment):
  `@tanstack/react-query-persist-client`, `@tanstack/query-async-storage-persister`,
  `@react-native-async-storage/async-storage` (Expo Go compatible per Expo docs).
- Replace `QueryClientProvider` with `PersistQueryClientProvider`:
  - `persistOptions.persister = createAsyncStoragePersister({ storage: AsyncStorage })`
  - `maxAge: 24h`, `buster: '1'` (bump to invalidate all persisted caches on schema change)
  - `dehydrateOptions.shouldDehydrateQuery`: persist only successful queries
    (`query.state.status === 'success'`).
- `gcTime` raised `5min → 24h` (TanStack requires gcTime ≥ maxAge for persistence
  to be meaningful).
- Effect: cold start rehydrates the cache → screens render last-known data
  instantly → React Query refetches in background per staleTime
  (stale-while-revalidate). Skeleton appears only on true first-ever load.

### 2. Fetch tuning (`src/hooks/useInsights.ts`)

- Insights queries `staleTime: 30s → 6h`. Meta reports insights with up to 48h
  delay; 30s staleness only buys repeated Graph calls.
- The insights account query gets `placeholderData: keepPreviousData` so the
  period toggle shows the previous window's data while the new one loads.
- `isLoading` semantics: full-screen loading only when there is **no data at
  all** (true first load); background refetches surface via a subtle indicator,
  never a skeleton.

### 3. Toggle fix (`src/app/(tabs)/(insights)/index.tsx`)

- Header + `PeriodToggle` **always mounted** — skeleton gates only the data
  sections (KPI grid, charts, top posts).
- On period switch: previous data stays visible; a small "Updating…" indicator
  shows while the new window fetches (`isPlaceholderData` / `isFetching`).
- Touch targets: toggle segments padded to ≥44px height + `hitSlop` 8.

### 4. Errors

- `session_expired` / `insights_permission` reconnect cards: unchanged, still
  take over the data area (header stays mounted).
- Background refetch failure **with restored/previous data visible**: silent —
  data on screen beats an error strip. Inline error strip only when there is no
  data to show.

### 5. Testing

- Update `src/__tests__/insights.test.tsx`: header/toggle now render during
  loading; add "period switch keeps previous data visible" case.
- New `src/__tests__/query-persistence.test.tsx`: provider wiring smoke test —
  `PersistQueryClientProvider` renders children, persister created with
  AsyncStorage + correct maxAge/buster.
- Existing suites untouched; full jest run must show no new failures vs the
  known-flaky baseline (`integration`, `home-dashboard`).

## Non-goals

- No MMKV, no dev-client requirement, no server-side insights cache, no changes
  to messages/home data flows beyond what persistence gives them for free.
