# src/__tests__/ — jest-expo Suites

23 suites + `test-utils.ts`. Run with `npx jest` (never `bun test` — segfaults under Bun 1.3.3). Filter: `--testPathPattern=instagram`; skip integration: `--testPathIgnorePatterns=integration`.

## MOCK BOUNDARY (the key convention)

- **`jest.setup.ts` (~315 lines) = infrastructure mocks only** — `expo-router` (incl. `Stack.Protected`, `useFocusEffect` runs once), `@/tw` passthrough, `react-native-reanimated` full stub, `@/lib/appwrite` (tablesDB/account/realtime), safe-area (zero insets), AsyncStorage, expo-font (loaded), expo-blur + `@sbaiahmed1/react-native-blur` (View), nativewind/react-native-css, `@/tw/cn`, `@/lib/auth-session`, `@/lib/realtime`, `@/hooks/useDashboard`. Env vars are set at the top before any import.
- **Per-file `jest.mock()` = screen-specific data** — hooks (`useAutomations`, `useAutomationGate`, `useAppwriteUser`), `@/lib/repository`, `@/lib/instagram`, `@/lib/instagram-oauth`, `@/lib/bridge-context`, `expo-linear-gradient`. Check `jest.setup.ts` BEFORE adding a per-file mock — duplicating a global mock causes subtle divergences.
- **`__mocks__/@expo/ui/`** — manual mocks (`Host`, `Switch`, `TextInput`, `useNativeState`, community `SegmentedControl`) because `@expo/ui` pulls native modules that break jest.

## TWO RENDER FLAVORS

1. **Hook tests + screens that let real React Query hooks run** → `renderHook()` / `render(<C/>, { wrapper: createQueryClientWrapper() })` from `./test-utils` (QueryClientProvider, `retry: false`).
2. **Screens that mock ALL data hooks at module level** (e.g. `home-dashboard`, `automate-home`) → plain `render(<Screen/>)`, no wrapper — no real queries execute.

Async assertions use `waitFor(..., { timeout: 5000, interval: 100 })`.

## SUITE MAP (condensed)

- lib clients: `automations-client`, `instagram` (190 refresh+retry), `instagram-oauth`, `auth-session`, `polyfills`
- hooks: `useAutomations`, `useAutomationGate`, `auth-flow`
- screens: `auth-gate`, `home-dashboard`, `automate-home`/`automate-new`/`automate-detail`, `messages`, `thread-detail`, `profile`, `insights`, `integration`
- components: `tab-bar` (4 tabs, nested-route hide), `screen-shell`, `ui-components`, `theme` (palette parity invariants), `query-client` (persistence rules)

## KNOWN FAILURES

- `ui-components.test.tsx` — 2 pre-existing failing `Input` style assertions: the mocked CSS runtime flattens style arrays differently than runtime. Everything else passes.
