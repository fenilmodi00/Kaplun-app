# src/app/ — Expo Router Routes

16 files: 7 layouts, 9 screens. File-based routing; deep-link scheme `kaplun://` (no universal-links config).

## ROUTE TREE

```
_layout.tsx                  ROOT: provider stack + auth gate + splash
sign-in.tsx                  /sign-in — thin wrapper around @/components/auth/AuthScreen
(tabs)/_layout.tsx           4 tabs ONLY: (home), (automate), (messages), (insights)
(tabs)/(home)/index.tsx      dashboard, 667 lines — owns the ONLY navigation to profile
(tabs)/(automate)/index.tsx  automations list, 368
(tabs)/(automate)/new.tsx    creation form, 1272 — largest screen in the repo
(tabs)/(automate)/[automationId].tsx  detail, 690 — raw-RN StyleSheet exception
(tabs)/(messages)/index.tsx  threads list, 192
(tabs)/(messages)/[threadId].tsx      chat, 264 — @/tw + inverted FlatList
(tabs)/(insights)/index.tsx  Instagram insights, 646
(tabs)/(profile)/index.tsx   profile + theme toggle, 701 — NOT a tab
```

No `+not-found.tsx`, no modals, no catch-alls.

## ROOT LAYOUT (`_layout.tsx`)

Provider stack, outer → inner: `GestureHandlerRootView` → `SafeAreaProvider` → `PersistQueryClientProvider` (`queryClient` + `persistOptions`) → `SessionProvider` → `BridgeProvider` → `ThemeVariablesProvider` (NativeWind `VariableContextProvider` fed by `cssVariablesForScheme()`; no-op on web) → `RootNavigator`. Module-level React Query `onlineManager` (NetInfo) + `focusManager` (AppState) live at the top of `_layout.tsx`.

- **Auth gate** — `Stack.Protected guard={!!session}` for `(tabs)`, `guard={!session}` for `sign-in`. No imperative `<Redirect>` logic.
- **Splash** — while fonts/session load, renders a centered `ClaySpinner` on the canvas color. No `expo-splash-screen` native control.
- **System chrome** — `StatusBar` / `NavigationBar` / `SystemUI` background are set here only, keyed off `useThemeScheme()` + `useThemeColors()`. Never set them in screens.

## CONVENTIONS

- **Profile is a hidden route** — `(profile)` is not registered in the tab bar. Reach it only via the home header avatar: `router.push('/(tabs)/(profile)' as never)`. The `as never` cast is required because typed routes don't know the unregistered group.
- **Group layouts are pass-throughs** — every group `_layout.tsx` is `<Stack screenOptions={{ headerShown: false }} />`. Only `(automate)/_layout.tsx` declares its child screens explicitly.
- **No native headers** — screens render their own back chevron + `useRouter().back()`.
- **Safe-area padding** — `useSafeAreaInsets()` + `TAB_BAR_OVERLAY` (from `@/components/screen-shell`) added to bottom padding so content clears the floating glass tab bar.
- **Dynamic params** — `useLocalSearchParams<{...}>()`; `[automationId]` also reads an optional `created` param (`'live' | 'paused'`) for post-creation banners.
- **Two styling regimes** — `@/tw` className is the standard; raw RN + `StyleSheet.create()` + `useThemeColors()` is the documented escape hatch (`[automationId].tsx`, `(profile)/index.tsx`) for Android `useCssElement` layout bugs. See `src/tw/AGENTS.md`.

## GOTCHAS

- `[threadId].tsx` calls `tablesDB.getRow()` directly to fetch the `DealThread` — the only screen-level Appwrite call; repository-pattern smell (fix or consciously preserve). It also casts `Reanimated.SlideInUp as any`.
- `new.tsx` at 1272 lines is the top refactor candidate — prefer targeted edits.
- The tab bar (`@/components/clay/TabBar`) hides entirely when the active automate nested route is `new`.
