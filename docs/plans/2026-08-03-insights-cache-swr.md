# Insights Cache + Toggle Fix Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Persist the React Query cache to AsyncStorage (stale-while-revalidate, no cold-start skeleton) and fix the 7D/28D toggle that eats presses.

**Architecture:** Approved design in `docs/plans/2026-08-03-insights-cache-swr-design.md`. A new `src/lib/query-client.ts` owns the QueryClient + AsyncStorage persister (unit-testable without rendering the root layout). `_layout.tsx` swaps `QueryClientProvider` → `PersistQueryClientProvider`. Insights queries get 6h staleTime + `keepPreviousData`; the screen keeps its header/toggle mounted through every loading state.

**Tech Stack:** Expo SDK 57, React Query v5 (`@tanstack/react-query` ^5.101.4), `@tanstack/react-query-persist-client` + `@tanstack/query-async-storage-persister` + `@react-native-async-storage/async-storage` (Expo Go compatible), Bun, jest-expo, `tsc --noEmit` lint gate.

**Commit policy:** The agent does NOT run git commits (project rule — commit only on explicit user request). Stage/review diffs at the end instead.

---

### Task 1: Install persistence dependencies

**Files:**
- Modify: `package.json` (via installer)

**Step 1: Install**

Run:
```bash
bun expo install @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @react-native-async-storage/async-storage
```
Expected: all three added to `dependencies` in `package.json`. TanStack packages install latest v5 (peer-compatible with installed `@tanstack/react-query` ^5.101.4); AsyncStorage resolves to the SDK 57 version.

**Step 2: Verify peer compatibility**

Run:
```bash
bun pm ls @tanstack/react-query-persist-client @tanstack/query-async-storage-persister @react-native-async-storage/async-storage
```
Expected: single versions, no peer warnings about `@tanstack/react-query`.

---

### Task 2: `src/lib/query-client.ts` — client + persister module (TDD)

**Files:**
- Create: `src/lib/query-client.ts`
- Test: `src/__tests__/query-client.test.ts`

**Step 1: Write the failing test**

Create `src/__tests__/query-client.test.ts`:

```ts
/**
 * Query client persistence wiring — the module owns the singleton QueryClient
 * and the AsyncStorage persister so the root layout stays declarative and the
 * config is unit-testable.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {
  queryClient,
  persistOptions,
  shouldPersistQuery,
  PERSIST_MAX_AGE,
  PERSIST_BUSTER,
} from '@/lib/query-client';

describe('query-client persistence wiring', () => {
  it('keeps gcTime >= maxAge so persisted entries survive until restore', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(PERSIST_MAX_AGE);
    expect(defaults.queries?.retry).toBe(false);
  });

  it('persists for 24h with a buster and an AsyncStorage persister', () => {
    expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE);
    expect(persistOptions.buster).toBe(PERSIST_BUSTER);
    expect(persistOptions.persister).toBeDefined();
  });

  it('persists only successful queries — errors and pending must refetch', () => {
    expect(shouldPersistQuery({ state: { status: 'success' } })).toBe(true);
    expect(shouldPersistQuery({ state: { status: 'error' } })).toBe(false);
    expect(shouldPersistQuery({ state: { status: 'pending' } })).toBe(false);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `bun run test -- src/__tests__/query-client.test.ts`
Expected: FAIL — `@/lib/query-client` does not exist.

**Step 3: Create the module**

Create `src/lib/query-client.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

export const PERSIST_MAX_AGE = 24 * 60 * 60_000; // 24h
export const PERSIST_BUSTER = '1'; // bump to invalidate every persisted cache

type QueryStatusShape = { state: { status: 'success' | 'error' | 'pending' } };

/** Persist only settled-success queries — errors/pending must refetch on restore. */
export function shouldPersistQuery(query: QueryStatusShape): boolean {
  return query.state.status === 'success';
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // gcTime must be >= maxAge or entries are collected before restore runs.
      gcTime: PERSIST_MAX_AGE,
      retry: false,
    },
  },
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage }),
  maxAge: PERSIST_MAX_AGE,
  buster: PERSIST_BUSTER,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersistQuery },
};
```

**Step 4: Run test to verify it passes**

Run: `bun run test -- src/__tests__/query-client.test.ts`
Expected: PASS (3 tests).

**Step 5: Type check**

Run: `bun run lint`
Expected: clean (no output after the tsc echo).

---

### Task 3: Wire `_layout.tsx` to `PersistQueryClientProvider`

**Files:**
- Modify: `src/app/_layout.tsx` (imports lines 9, 27–35; provider lines 157–161)
- Modify: `jest.setup.ts` (append AsyncStorage mock)
- Test: `src/__tests__/auth-gate.test.tsx` (regression — must stay green)

**Step 1: Add the global AsyncStorage jest mock**

Append to `jest.setup.ts` (the lib ships its own jest mock):

```ts
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
```

**Step 2: Swap the provider in `_layout.tsx`**

Replace:
```ts
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
```
with:
```ts
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { queryClient, persistOptions } from '@/lib/query-client';
```

Delete the local `const queryClient = new QueryClient({...})` block (lines 27–35).

Replace:
```tsx
<QueryClientProvider client={queryClient}>
  <BridgeProvider>
    <AuthGate />
  </BridgeProvider>
</QueryClientProvider>
```
with:
```tsx
<PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
  <BridgeProvider>
    <AuthGate />
  </BridgeProvider>
</PersistQueryClientProvider>
```

**Step 3: Regression — auth gate + type check**

Run: `bun run lint && bun run test -- src/__tests__/auth-gate.test.tsx src/__tests__/query-client.test.ts`
Expected: tsc clean; both suites PASS. (If any other suite imports `_layout.tsx` and breaks on the new imports, the jest.setup mock from Step 1 covers AsyncStorage; persist-client itself is plain JS and safe to import unmocked.)

---

### Task 4: `useInsights.ts` — 6h staleTime + keepPreviousData + isRefreshing

**Files:**
- Modify: `src/hooks/useInsights.ts`

**Step 1: Apply changes**

- Import `keepPreviousData`:
```ts
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';
```
- Add near the top:
```ts
// Meta reports insights with up to 48h delay — 30s staleness only buys
// repeated Graph calls. 6h keeps the tab cheap without going stale in-session.
const INSIGHTS_STALE_TIME = 6 * 60 * 60_000;
```
- All three queries: `staleTime: INSIGHTS_STALE_TIME` (replaces `30_000`).
- The `insightsAccount` query gains: `placeholderData: keepPreviousData`.
- Extend `UseInsightsResult` with `isRefreshing: boolean`.
- `isLoading` becomes true only when there is genuinely nothing to show:
```ts
isLoading: !isReady || (insightsQuery.isPending && insightsQuery.data === undefined),
isRefreshing: insightsQuery.isFetching,
```

**Step 2: Type check**

Run: `bun run lint`
Expected: clean.

(Screen tests updated in Task 6 cover the behavior; hook has no standalone suite — consistent with the project's other hooks.)

---

### Task 5: `(insights)/index.tsx` — always-mounted chrome + touch targets + Updating indicator

**Files:**
- Modify: `src/app/(tabs)/(insights)/index.tsx`

**Step 1: Restructure the render**

- Consume `isRefreshing` from `useInsights`.
- Remove the early `if (isLoading) return ...` branch. New structure: header `Entrance` renders **always**; below it exactly one of — `DataSkeleton` (isLoading), `ReconnectCard` (reconnect errors), or the content sections.
- Rename `DashboardSkeleton` → `DataSkeleton` and delete its two header placeholder blocks (real header now renders above it).
- Header right side becomes a row: when `isRefreshing && !isLoading`, show a small "Updating…" indicator (6px `bg-brand-ochre` dot + 11.5px `text-muted-soft` label) left of the toggle:
```tsx
<View className="flex-row items-center" style={{ gap: 10 }}>
  {isRefreshing && !isLoading ? (
    <View className="flex-row items-center" style={{ gap: 5 }}>
      <View className="bg-brand-ochre" style={{ width: 6, height: 6, borderRadius: 3 }} />
      <Text className="text-muted-soft" style={{ fontSize: 11.5 }}>Updating…</Text>
    </View>
  ) : null}
  <PeriodToggle days={windowDays} onChange={setWindowDays} />
</View>
```

**Step 2: Fix toggle touch targets (≥44px effective)**

In `PeriodToggle`, each segment `Pressable` gains `hitSlop={6}` and larger padding:
```tsx
<Pressable
  key={option}
  onPress={() => onChange(option)}
  hitSlop={6}
  style={{
    borderRadius: 9999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    minWidth: 48,
    alignItems: 'center',
    backgroundColor: active ? '#0a0a0a' : 'transparent',
  }}
>
```

**Step 3: Type check**

Run: `bun run lint`
Expected: clean.

---

### Task 6: Update `src/__tests__/insights.test.tsx` (TDD for new behavior)

**Files:**
- Modify: `src/__tests__/insights.test.tsx`

**Step 1: Update mocks and loading expectation**

- `mockState` default gains `isRefreshing: false`.
- Loading test: header is now always mounted — replace the "without the header" expectation:
```ts
it('loading: renders header + toggle with a data skeleton below', async () => {
  mockState({ isLoading: true, insights: null, profile: null, topMedia: [] });
  await render(<InsightsScreen />);

  expect(screen.getByText('Insights')).toBeTruthy();
  expect(screen.queryByText('270')).toBeNull(); // no data values yet
});
```

**Step 2: Add the updating-indicator test**

```ts
it('background refresh: keeps data visible with an Updating indicator', async () => {
  mockState({ isRefreshing: true });
  await render(<InsightsScreen />);

  expect(screen.getAllByText('270').length).toBeGreaterThan(0); // data stays
  expect(screen.getByText('Updating…')).toBeTruthy();
});
```

**Step 3: Run to verify the loading test fails against the old structure**

Run before Task 5 if doing strict TDD order; otherwise run now:
Run: `bun run test -- src/__tests__/insights.test.tsx`
Expected: all 7 tests PASS against the Task 5 screen. (Strict TDD: write the test first, watch it fail on the old early-return skeleton, then implement Task 5.)

---

### Task 7: Full verification

**Step 1: Type check**

Run: `bun run lint`
Expected: clean.

**Step 2: Targeted suites**

Run: `bun run test -- src/__tests__/query-client.test.ts src/__tests__/insights.test.tsx src/__tests__/instagram.test.ts src/__tests__/auth-gate.test.tsx`
Expected: all PASS.

**Step 3: Full suite vs baseline**

Run: `bun run test`
Expected: same failures as the pre-existing baseline (`integration.test.tsx`, `home-dashboard.test.tsx` — flaky/known-bad before this work) and no new failing suites.

**Step 4: Manual smoke (user)**

`bun start` → open Insights twice: second cold start renders cached data instantly (no skeleton) with the "Updating…" dot while Meta refetches; tap 7D/28D repeatedly — data stays on screen and the toggle responds on the first press.

**Step 5: Review diff and hand back for commit**

Run: `git status && git diff --stat`
Expected: `package.json`, `bun.lock`, `jest.setup.ts`, `src/app/_layout.tsx`, `src/lib/query-client.ts` (new), `src/hooks/useInsights.ts`, `src/app/(tabs)/(insights)/index.tsx`, `src/__tests__/query-client.test.ts` (new), `src/__tests__/insights.test.tsx`, `docs/plans/*`. No commits made by the agent.
