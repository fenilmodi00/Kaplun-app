# src/app/ — Expo Router Routes

16 files: 7 layouts, 9 routes. File-based routing; deep-link scheme `kaplun://` (no universal-links config).

## ROUTES-ONLY RULE

Every `.tsx` file under `src/app/` is a route or layout. No test files, no helpers, no utilities. Expo Router treats every file as a route, so colocated tests or non-route modules would break the routing graph. Test files live beside their screen modules in `src/screens/`.

## ROUTE TREE

```
_layout.tsx                  ROOT: provider stack + auth gate + splash
sign-in.tsx                  /sign-in — thin wrapper around @/components/auth/AuthScreen
(tabs)/_layout.tsx           4 tabs ONLY: (home), (automate), (messages), (insights)
(tabs)/(home)/index.tsx      → @/screens/home
(tabs)/(automate)/list.tsx   → @/screens/automate
(tabs)/(automate)/new.tsx    → @/screens/automate/new
(tabs)/(automate)/[automationId].tsx  → @/screens/automate/detail
(tabs)/(messages)/threads.tsx  → @/screens/messages
(tabs)/(messages)/[threadId].tsx      → @/screens/messages/thread
(tabs)/(insights)/dashboard.tsx  → @/screens/insights
(tabs)/(profile)/view.tsx    → @/screens/profile (NOT a tab — pushed from home avatar)
```

No `+not-found.tsx`, no modals, no catch-alls. All 8 tab routes are 1-line re-exports (≤5 lines each); `sign-in.tsx` is a thin wrapper. Screen logic lives in `src/screens/` (see `src/screens/AGENTS.md`).

## RE-EXPORT CONTRACT

Each tab route file is a single line:

```typescript
export { default } from '@/screens/<path>';
```

This preserves the default-export import contract that test suites rely on. Screens that need route params call `useLocalSearchParams` internally, not via prop drilling from the route file. The `as never` cast for profile navigation stays in the route file, not the screen.

### Route-to-screen map

| Route file | Screen module |
|------------|---------------|
| `(tabs)/(home)/index.tsx` | `@/screens/home` |
| `(tabs)/(automate)/list.tsx` | `@/screens/automate` |
| `(tabs)/(automate)/new.tsx` | `@/screens/automate/new` |
| `(tabs)/(automate)/[automationId].tsx` | `@/screens/automate/detail` |
| `(tabs)/(messages)/threads.tsx` | `@/screens/messages` |
| `(tabs)/(messages)/[threadId].tsx` | `@/screens/messages/thread` |
| `(tabs)/(insights)/dashboard.tsx` | `@/screens/insights` |
| `(tabs)/(profile)/view.tsx` | `@/screens/profile` |

## ROOT LAYOUT (`_layout.tsx`)

Provider stack, outer → inner: `PanelUIProvider` → `SafeAreaProvider` → `ThemeProvider` (expo-router, fed from PanelUI tokens via `useCSSVariable`) → `PersistQueryClientProvider` (`queryClient` + `persistOptions`) → `SessionProvider` → `BridgeProvider` → `RootNavigator`. Module-level React Query `onlineManager` (NetInfo) + `focusManager` (AppState) live at the top of `_layout.tsx`.

- **Auth gate** — `Stack.Protected guard={!!session}` for `(tabs)`, `guard={!session}` for `sign-in`. No imperative `<Redirect>` logic.
- **Splash** — while fonts/session load, renders a centered `ClaySpinner` on the canvas color. No `expo-splash-screen` native control.
- **System chrome** — `StatusBar` / `NavigationBar` / `SystemUI` background are set here only, keyed off `useThemeMode().mode` + `useCSSVariable('--color-background')`. Never set them in screens.

## CONVENTIONS

- **Profile is a hidden route** — `(profile)` is not registered in the tab bar. Reach it only via the home header avatar: `router.push('/(tabs)/(profile)' as never)`. The `as never` cast is required because typed routes don't know the unregistered group.
- **Group layouts have named-route anchors** — only `(home)` has an `index.tsx` (owns `/`). All other groups use named routes (`list`, `threads`, `dashboard`, `view`) with `unstable_settings = { anchor: '<name>' }` so they don't compete for `/` in the linking config.
- **No native headers** — screens render their own back chevron + `useRouter().back()`.
- **Safe-area padding** — `useSafeAreaInsets()` + `TAB_BAR_OVERLAY` (from `@/components/screen-shell`) added to bottom padding so content clears the floating glass tab bar.
- **Dynamic params** — `useLocalSearchParams<{...}>()`; `[automationId]` also reads an optional `created` param (`'live' | 'paused'`) for post-creation banners.
- **Two styling regimes** — `@/tw` className is the standard; raw RN + `StyleSheet.create()` is the documented escape hatch (`src/screens/automate/detail/index.tsx`, `src/screens/profile/index.tsx`) for Android layout stability. See `src/tw/AGENTS.md` for the full escape-hatch list.

## GOTCHAS

- `src/screens/messages/thread.tsx` calls `tablesDB.getRow()` directly to fetch the `DealThread` — the only screen-level Appwrite call; repository-pattern smell (fix or consciously preserve). It also casts `Reanimated.SlideInUp as any`.
- `src/screens/automate/new/index.tsx` at ~1112 lines is the top refactor candidate — prefer targeted edits.
- The tab bar (`@/components/tab-bar/TabBar`) hides entirely when the active automate nested route is `new`.
