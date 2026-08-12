# src/testing/ — Shared test infrastructure

Holds cross-cutting test utilities and shared suites. Run with `bunx jest` (never `bun test` — segfaults under Bun 1.3.3). Filter: `--testPathPattern=instagram`; skip integration: `--testPathIgnorePatterns=integration`.

## Contents

- `test-utils.ts` — `createQueryClientWrapper()` (QueryClientProvider, `retry: false`). Imported as `@/testing/test-utils` from any suite that needs a real React Query context.
- `integration.test.tsx` — Home screen integration suite (imports `Home` from `@/app/(tabs)/(home)/index`).
- `auth-gate.test.tsx` — Root auth layout suite (imports `RootLayout` from `@/app/_layout`).
- `initial-route.test.tsx` — Initial route resolution suite.

Remaining suites are colocated: `src/lib/` (8), `src/hooks/` (4), `src/screens/` (12), `src/components/` (4).

## MOCK BOUNDARY (the key convention)

- **`jest.setup.ts` (~315 lines) = infrastructure mocks only** — `expo-router` (incl. `Stack.Protected`, `useFocusEffect` runs once), `@/tw` passthrough, `react-native-reanimated` full stub, `@/lib/appwrite` (tablesDB/account/realtime), safe-area (zero insets), AsyncStorage, expo-font (loaded), expo-blur + `@sbaiah1/react-native-blur` (View), uniwind/panelui-native, `@/tw/cn`, `@/lib/auth-session`, `@/lib/realtime`, `@/hooks/useDashboard`. Env vars are set at the top before any import.
- **Per-file `jest.mock()` = screen-specific data** — hooks (`useAutomations`, `useAutomationGate`, `useAppwriteUser`), `@/lib/repository`, `@/lib/instagram`, `@/lib/instagram-oauth`, `@/lib/bridge-context`, `expo-linear-gradient`. Check `jest.setup.ts` BEFORE adding a per-file mock — duplicating a global mock causes subtle divergences.
- **`__mocks__/@expo/ui/`** — (DELETED in Phase 3 — `@expo/ui` package removed, all importers migrated to PanelUI).

## TWO RENDER FLAVORS

1. **Hook tests + screens that let real React Query hooks run** → `renderHook()` / `render(<C/>, { wrapper: createQueryClientWrapper() })` from `@/testing/test-utils` (QueryClientProvider, `retry: false`).
2. **Screens that mock ALL data hooks at module level** (e.g. `home-dashboard`, `automate-home`) → plain `render(<Screen/>)`, no wrapper — no real queries execute.

Async assertions use `waitFor(..., { timeout: 5000, interval: 100 })`.

## SUITE MAP (condensed)

Suites in `src/testing/`:
- `integration` (Home screen end-to-end), `auth-gate` (root layout Protected gate), `initial-route`

Suites colocated in `src/lib/`:
- `automations`, `instagram` (190 refresh+retry), `instagram-oauth`, `auth-session`, `polyfills`, `format-time`, `theme` (palette parity invariants), `query-client` (persistence rules)

Suites colocated in `src/hooks/`:
- `useAutomations`, `useAutomationGate`, `useAuthFlow`, `useMessages`

Suites colocated in `src/screens/`:
- `home`, `automate`/`automate-new`/`automate-detail`, `messages`, `thread`, `profile`, `insights` + 4 `utils.test.ts`

Suites colocated in `src/components/`:
- `tab-bar` (4 tabs, nested-route hide), `screen-shell`, `ui-components`, `error-state`

## KNOWN FAILURES

- `ui-components.test.tsx` — 2 pre-existing failing `Input` style assertions: the mocked CSS runtime flattens style arrays differently than runtime. Everything else passes.
