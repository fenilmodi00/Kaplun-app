# PanelUI Migration Design

**Date:** 2026-08-12
**Status:** Revised per Momus plan-critic review — ready for implementation
**Branch:** `ui/dark-theme` (current)

> **Revision log:**
> - 2026-08-12 (post-`.omo/plans/2026-07-26-panelui-migration-design.md` → spec): filled in gaps surfaced by Metis + multimodal-looker — jest setup, theme tests, score screens, ClayAvatar dependency, `@/tw` non-trivial exports, `useThemeMode()` API, AMOLED variant.
> - 2026-08-12 (post-Momus critique): fixed 3 blockers — (B1) Uniwind has no persistence mechanism, keep existing store + hydrate calls `Uniwind.setTheme`; (B2) profile toggle uses `useThemePreference`/`setThemePreference`, not `useThemeScheme` — added Phase 1 step 9 to wire the seam; (B3) Phase 3 step 1 would delete TabBar — added move step + ClaySpinner swap. Plus 9 non-blocking fixes: `react-native-worklets` already installed, `ShareSheet`/`LinkPreview` don't exist in registry, bottomsheet is a rebuild not a re-wire, AMOLED sketch corrected (override built-in `@variant dark`, don't re-declare `@custom-variant`), PanelUI dark is `#141414` not `#262626`, `@expo/ui` removal added to Phase 3, `nativewind-env.d.ts` cleanup added, dangling "grep commands" reference filled in, per-screen commit gets explicit pathspec, "shippable" claim clarified.

## Summary

Replace Kaplun's custom styling stack (NativeWind v5 + `react-native-css` + Clay design system + custom `ui/` kit) with **Uniwind (free, MIT)** + **PanelUI** (`panelui-native` package). Adopt PanelUI's default theme with a **custom dark variant preserving pure-black AMOLED (`#000000`)**. Migrate screen-by-screen from custom components to PanelUI's 130+ component library. Drop the Clay visual language, but **keep our custom TabBar and BottomSheet** — re-wire them to Uniwind rather than replacing them.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tailwind engine | Uniwind FREE (MIT, $0) | Drop-in NativeWind replacement, 2-5x faster, no Babel preset, Expo Go compatible, PanelUI's native engine |
| Component source | PanelUI package (`panelui-native`) | Full 130+ component library, updates via version bump, designed for Uniwind pipeline |
| Clay design system | Abandon — adopt PanelUI default theme, dark variant = pure black AMOLED (`#000000` vs PanelUI's `#141414`) | User decision; AMOLED black is a hard requirement, so the dark theme gets a custom variant overriding PanelUI's default dark. Custom theme defined once in CSS, applied via `Uniwind.setTheme()` |
| Migration strategy | Phased — engine first, then screen-by-screen | Lower risk. "Shippable at each phase boundary" means **functionally correct on a feature branch** — Phase 1 will render with a foreign visual theme (Clay tokens replaced by PanelUI tokens) until Phase 2 restyles each screen. If phase boundaries must be user-shippable, Phase 1 + 2 must merge together. |
| Web target | Secondary — keep bootable, PanelUI components are pure TS (no native modules) | Uniwind free supports web; PanelUI components should render with web stubs; native is primary |

## Research Findings

### Uniwind Free vs Pro

| Feature | Free (MIT) | Pro ($99/seat/yr) |
|---------|-----------|-------------------|
| Tailwind CSS v4 | Full | Full |
| Expo Go | Yes | No (dev client only) |
| `className` on all RN components | Yes | Yes |
| Theme system (light/dark/custom) | Yes | Yes |
| Web support | Yes | Yes |
| Engine | JS (optimized) | C++ (Unistyles) |
| Zero re-renders | No | Yes (ShadowTree) |
| Reanimated 4 via `className` | No (use `style` prop) | Yes |
| Native theme transitions | No | Yes |

**Verdict:** Free is sufficient for Kaplun. Pro features (zero re-renders, C++ engine, native animations) are performance optimizations for high-throughput apps, not functional requirements.

### PanelUI default theme vs Kaplun AMOLED — custom dark variant required

PanelUI's default `panel` theme swatch is `['#262626', '#f5f5f5']` — light `#f5f5f5`, dark `#141414` (the `#262626` is the swatch label, not the token value). Kaplun's current dark canvas is pure AMOLED black (`#000000`) and the user considers preserving it a hard requirement. A custom dark variant is needed. Uniwind's theming is CSS-driven, so this is a CSS change, not a panel-ui config object. The plan for it:

- `src/global.css` imports `panelui-native/theme.css` (baseline panel theme — `light` and `dark` variants are built-in)
- Override the dark canvas token **after** the theme.css import, inside the built-in `@variant dark` scope: `--color-background: #000000`
- Do NOT re-declare `@custom-variant dark` — it already exists in theme.css. Re-declaring it with a different selector would shadow the built-in. If a fully custom named theme is needed instead, register it via `extraThemes` (but every token must be defined or the build fails — simpler to override built-in dark)
- Also rewrite or drop the `@media ios`/`@media android` font-fallback blocks (Uniwind equivalent: `@variant ios`/`@variant android`)
- Exact mechanism pinned during Phase 1 step 11 verification (`useThemeMode().mode` must be `'dark'` default; `toggleMode()` switches; app restart keeps preference; AMOLED `#000000` is active)

Persistence: the current system uses AsyncStorage key `@kaplun/theme-preference`. **Verified:** Uniwind's `Uniwind.setTheme()` is an **in-memory singleton with no storage key and no persistence mechanism** — default is `'system'`. There is nothing to migrate *to*. The design is: **keep the existing `@kaplun/theme-preference` AsyncStorage store**; on boot, `hydrateThemePreference` reads the stored value and calls `Uniwind.setTheme(stored ?? 'dark')`; `setThemePreference` calls `Uniwind.setTheme` in addition to writing the store. Uniwind's `'system'` default conflicts with Kaplun's hard "dark default, OS scheme ignored" requirement — the hydrate call at boot (default `'dark'`) closes that gap. A brief light-flash is possible for stored-`'light'` users before hydrate runs (same class of flash the current code already has, noted by its own ponytail comment); acceptable, not a blocker.

### Uniwind vs NativeWind

- Uniwind is a **drop-in replacement** — same `className` API, same mental model
- Migration: remove Babel preset (Kaplun has none for NativeWind), swap `withNativewind` → `withUniwindConfig` in metro config, update CSS imports
- 2-5x faster (81ms vs 258ms for 2000+ views on iOS, release mode)
- No Babel preset needed (Metro plugin only) — simpler builds
- Built for Tailwind v4 from the ground up; NativeWind v5 is still in preview
- From the Unistyles team (established RN styling ecosystem)

### PanelUI Package vs Copy-Source

PanelUI supports two modes: install as a package, or copy component source via CLI. We chose **package** because:
- Full 130+ component library available immediately
- Updates arrive with version bumps
- Components designed for Uniwind pipeline — no manual adaptation
- Can still copy individual components later if we need to fork one

## Architecture: Before → After

### Foundation Changes

| Layer | Current | After Migration |
|-------|---------|-----------------|
| Metro config | `withNativewind(config, {...})` + web stubs | `withUniwindConfig(config, {...})` + web stubs (kept) |
| CSS entry | `@import "nativewind/theme"` + Clay `@theme` tokens | `@import 'uniwind'` + `@import 'panelui-native/theme.css'` + PanelUI tokens |
| Root provider | `VariableContextProvider` (NativeWind) | `PanelUIProvider` (gesture root + portal host + toasts) |
| Theme switching | `useThemeColors()` / `cssVariablesForScheme()` / `hydrateThemePreference()` | `useThemeMode()` from PanelUI + `useCSSVariable()` from Uniwind |
| `@/tw` bridge | `useCssElement(RNComp, props, {className: 'style'})` wrappers | Thin re-exports of RN components (Uniwind handles `className` natively) |
| `@/tw/cn.ts` | `cn()` + Clay compound utilities (`clayInput`, `clayCard`, etc.) | `cn()` only (Clay utilities removed in Phase 3) |
| `src/lib/theme.ts` | `lightColors`/`darkColors`/`lightCssVariables`/`darkCssVariables`/`useThemeColors`/`useThemeScheme`/`cssVariablesForScheme`/`hydrateThemePreference` | Slimmed — remove CSS variable maps and `cssVariablesForScheme`; keep `useThemeColors()` temporarily for raw-RN escape hatches |
| Babel config | `babel-preset-expo` + reanimated plugin | Unchanged (Uniwind needs no Babel preset) |

### Web Support

Uniwind free supports web. The existing Reanimated/worklets web stubs in `metro.config.js` (aliasing `react-native-reanimated` and `react-native-worklets` to no-op stubs on web platform) stay. PanelUI components are pure TypeScript with no native modules, so they should render on web with the stubs. If any don't, they'll be addressed per-component during screen migration. Web remains a secondary target — native is primary.

### `@/tw` Bridge Simplification

Uniwind makes `className` work on raw RN components directly — no `useCssElement` bridge needed.

**Current** (`src/tw/index.tsx`):
```tsx
export function View(props) {
  return useCssElement(RNView, props, { className: 'style' });
}
```

**After:**
```tsx
export { View, Text, ScrollView, Pressable, TextInput } from 'react-native';
```

The import path `@/tw` stays — zero import changes across the codebase. The bridge becomes a thin compatibility layer, removable once all screens use PanelUI components directly.

`@/tw/cn.ts` — `cn()` stays (still useful for merging classes). Clay compound utilities removed in Phase 3.

`@/tw/image.tsx` — simplifies to a re-export (Uniwind handles `className` on images).

`@/tw/animated.tsx` / `.web.tsx` — stays as-is (platform-specific AnimatedView, Uniwind doesn't replace Reanimated).

## Phase 1 — Engine Swap (Foundation)

**Goal:** Uniwind replaces NativeWind. App boots and renders with existing screens working via the `@/tw` compatibility layer.

### Steps

1. **Install packages:** `uniwind`, `react-native-svg`, `panelui-native` (`react-native-worklets` is already installed — Reanimated 4's runtime — no install needed)
2. **Remove packages:** `nativewind`, `react-native-css` from `package.json`
3. **Update `metro.config.js`:**
   - Replace `withNativewind` import with `withUniwindConfig` from `uniwind/metro`
   - Configure: `cssEntryFile: './src/global.css'`, `dtsFile: './uniwind-types.d.ts'`
   - Keep the web Reanimated/worklets stubs (resolveRequest override)
   - Keep `inlineRequires: true` for worklets (#9445)
4. **Update `src/global.css`:**
   - Replace `@import "nativewind/theme"` with `@import 'uniwind'` + `@import 'panelui-native/theme.css'`
   - Add `@source '../node_modules/panelui-native/src'` (so PanelUI's own class names compile)
   - Remove the Clay `@theme` block (colors, radii, spacing, fonts, typography tokens)
   - Remove the dark `@media (prefers-color-scheme: dark)` override block
   - Keep any Kaplun-specific custom tokens (brand colors) as additional `@theme` entries if still needed
5. **Simplify `src/tw/index.tsx`:** remove `useCssElement` imports and wrappers; thin re-export RN components. **MUST preserve** the non-trivial exports: `Link` wrapper with `.Trigger`/`.Menu`/`.MenuAction`/`.Preview` compound components (from `expo-router`), `ScrollView` as `forwardRef` accepting `contentContainerClassName`, `TouchableHighlight` with style flattening + `underlayColor` extraction, and re-point `useCSSVariable` to Uniwind's equivalent. Remove the `import { useUnstableNativeVariable } from 'nativewind'` — it throws module-not-found once `nativewind` is uninstalled.
6. **Replace root provider in `src/app/_layout.tsx`:**
   - New provider stack order (from current): `PanelUIProvider` (replaces `GestureHandlerRootView` + `ThemeVariablesProvider`; owns portal host + toast viewport) → `SafeAreaProvider` → `PersistQueryClientProvider` → `SessionProvider` → `BridgeProvider` → `RootNavigator`. `StatusBar` + `NavigationBar` stay, reading from `useThemeMode().mode` / `useCSSVariable('--color-background')`. **Note:** the current `_layout.tsx` has no expo-router `ThemeProvider` — it is added here (fed from PanelUI tokens via `useCSSVariable()`, per PanelUI's Expo Router guide). Also swap `ClaySpinner` (loading gate, L23) → PanelUI `Spinner` here — `_layout.tsx` is not a Phase-2 screen, so this swap must happen in Phase 1 (or Phase 3 step 2 pre-step).
7. **Replace theme switching:**
   - Replace `useThemeScheme()` with `const { mode } = useThemeMode()` from `panelui-native`. **API differs:** `useThemeMode()` returns `{ family, mode, setFamily, setMode, toggleMode }`, NOT a string. All call sites (`_layout.tsx`, `ui/switch.tsx`, `ui/bottomsheet/index.tsx`, `screens/automate/index.tsx`) must destructure `mode`.
   - Replace `cssVariablesForScheme()` — Uniwind handles theme switching natively via CSS (`@custom-variant dark`), no React context wrapper.
   - System chrome (StatusBar, NavigationBar, SystemUI): read background color from `useCSSVariable('--color-background')`
   - **Keep `useClayFonts()` / `@/lib/fonts` as-is through all phases** (Inter font loading continues; rename optional in Phase 3).
8. **Adapt `src/lib/theme.ts`:**
   - Remove `lightCssVariables` / `darkCssVariables` / `cssVariablesForScheme` (Uniwind handles CSS variables natively)
   - **Keep `hydrateThemePreference`** — it now reads the stored `@kaplun/theme-preference` and calls `Uniwind.setTheme(stored ?? 'dark')` on boot. Do NOT remove it: Uniwind has no persistence mechanism (verified), so this hydrate call is the only thing keeping theme preference across restarts. Default `'dark'`, never `'system'`.
   - **Keep `useThemePreference` / `setThemePreference`** — the store stays as the persistence layer. `setThemePreference` must call `Uniwind.setTheme` in addition to writing AsyncStorage (single seam: setter updates both the store and Uniwind's in-memory singleton).
   - **Rewire `useThemeScheme`** to derive from `useThemeMode().mode` (or `useUniwind()` directly) instead of the old module-level store — so all `useThemeScheme` call sites get the Uniwind-driven value.
   - Keep `useThemeColors()` for raw-RN escape hatches. **Implementation: keep `lightColors`/`darkColors` as static maps and select by `useThemeMode().mode`** — do NOT re-implement with 24 `useCSSVariable()` calls (violates rules of hooks, fragile). Static maps + mode selector stays reactive and correct.
9. **Rewire the profile theme toggle (CRITICAL — else Phase 1 acceptance "Theme toggle works" is unreachable):**
   - The actual toggle lives in `src/screens/profile/index.tsx` (L33/49/65) and uses `useThemePreference()` / `setThemePreference()` — NOT `useThemeScheme()`. The spec's step 7 call-site list missed this sibling API.
   - **Minimal Phase-1 touch (do NOT wait for Phase 2 screen #8):** the profile toggle's setter already calls `setThemePreference` — which now calls `Uniwind.setTheme` (per step 8 fix) — so the toggle drives Uniwind immediately. The toggle's reader (`useThemePreference`) stays reading the store. Both sides are wired through the seam in step 8. No full profile screen rewrite needed in Phase 1 — just verify the toggle flips the theme across PanelUI/className styling + StatusBar + raw-RN islands.
   - **Phase 2 screen #8** still does the full profile screen migration (Clay → PanelUI components, StyleSheet removal), but the toggle mechanism is already working from Phase 1.
10. **Update test mocks (CRITICAL — else `npx jest` fails immediately):**
   - `jest.setup.ts`: replace `nativewind` mock (`useUnstableNativeVariable`, `VariableContextProvider`, `styled`) and `react-native-css` mock (`useCssElement`, `useNativeVariable`) with `uniwind` mocks; add `panelui-native` mock for `PanelUIProvider` + `useThemeMode`/`useTheme`. Note: there is **no `jest.mock('@/tw')`** — only `@/tw/image`, `@/tw/animated`, `@/tw/cn` subpath mocks exist. Once `@/tw` is thin re-exports, the nativewind/react-native-css mocks can be deleted entirely and the real `@/tw` runs against the uniwind mock. Re-point `useCSSVariable` to uniwind's export (verified: `useCSSVariable` from `uniwind` accepts string or array). Delete `nativewind-env.d.ts` (orphaned by metro `typescriptEnvPath` removal).
   - `src/testing/auth-gate.test.tsx` lines 18-45: update its `@/lib/theme` mock to match post-phase exports (keep `useThemePreference`/`setThemePreference`/`useThemeColors`/`useThemeScheme`; remove `cssVariablesForScheme`/`lightCssVariables`/`darkCssVariables`).
   - `src/lib/theme.test.ts`: delete, rewrite, or slim to match the new theme surface — do not leave stale.
11. **Verify:** app boots, existing screens render using token aliases/remapped class names. Visual appearance will shift — Clay tokens replaced by PanelUI + custom dark tokens. Expected; screens restyle in Phase 2. **Verify the AMOLED dark `#000000` is active** — this is a hard requirement; if the dark variant doesn't resolve to pure black, fix the CSS override before proceeding.
12. **New EAS development build:** required because `react-native-svg` is a new native dependency. (`react-native-worklets` is already installed — Reanimated 4's runtime — so no new native dep from it.)

### Acceptance Criteria

- [ ] `bun start --clear` launches the app without errors
- [ ] All 4 tabs render (home, automate, messages, insights)
- [ ] Sign-in screen renders
- [ ] Profile screen renders
- [ ] Theme toggle works (light/dark switching via `useThemeMode()`)
- [ ] `tsc --noEmit` passes
- [ ] `npx jest` passes (existing tests, accounting for theme token changes)

## Phase 2 — Screen-by-Screen Migration

**Goal:** Replace custom components with PanelUI equivalents, screen by screen. Each screen is a shippable checkpoint.

### Migration Order (simplest → most complex)

| # | Screen | Current components | PanelUI replacements | LOC |
|---|--------|-------------------|----------------------|-----|
| 1 | Home | `@/tw` View/Text/Pressable, ClayFeatureCard, ClayAnimatedCard, ClayAvatar | `Card`, `Avatar`, `Button`, `Text`, `Surface` | ~moderate |
| 2 | Insights | `@/tw` primitives, badges, cards | `Card`, `Badge`, `Kpi`, `Text`, charts | ~moderate |
| 3 | Messages list | `@/tw` FlatList, badges, error-state | `Item`, `Avatar`, `Badge`, `EmptyState` | ~moderate |
| 4 | Messages thread | Raw RN + StyleSheet (escape hatch), `@/tw` | `Message`, `MessageScroller`, `Input` | ~moderate |
| 5 | Automate list | `@/tw` primitives, cards, toggle-card | `Card`, `Switch`, `Badge`, `Item` | ~moderate |
| 6 | Automate detail | Raw RN + StyleSheet (escape hatch) | `Card`, `Item`, `Switch`, `Dialog` | ~moderate |
| 7 | Automate new (1112 lines) | `@/tw` primitives, custom form | `Input`, `Select`, `Switch`, `Field`, `Form` | large |
| 8 | Profile | Raw RN + StyleSheet (escape hatch), theme toggle | `Card`, `Switch`, `Avatar`, `Button` + `useThemeMode()` | ~moderate |
| 9 | Auth (761 lines) | Raw RN + StyleSheet, custom OTP | `Input`, `Button`, `OtpInput`, `Card` | large |
| 10 | Score (7 files: `scorecard.tsx`, `ceremony.tsx`, `components.tsx`, `share-card.tsx`, `share.ts`, `index.tsx`, `index.test.tsx`) | `@/tw` + `useThemeColors()` (7 call sites), `share-card.tsx` imports `lightColors` directly | `Card`, `Kpi`, `Text` (share path keeps existing `expo-sharing`/`react-native-view-shot` — no PanelUI `ShareSheet`/`LinkPreview` exist in the registry) | ~moderate |

### Per-Screen Migration Process

For each screen:
1. Read the current screen implementation
2. Identify all custom components used (`@/tw` primitives, Clay components, `ui/` kit, `@expo/ui` imports)
3. Map each to PanelUI equivalent (see Component Mapping below)
4. Rewrite the screen using PanelUI components
5. Remove now-unused custom component imports — including all Clay compound utilities (`clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase`) and any direct `@expo/ui` imports
6. Update `scripts/check-structure.mjs` raw-RN exception list per-screen as that screen migrates away from raw-RN + StyleSheet (do NOT defer all to Phase 3 — the check goes stale)
7. Verify: screen renders, interactions work, theme switching works
8. Run adjacent tests
9. Commit — use explicit pathspec (`git add <screen paths> && git commit`) to avoid sweeping a concurrent operator's in-flight edits into this screen's checkpoint

### Component Mapping

| Kaplun custom | PanelUI replacement | Notes |
|---------------|---------------------|-------|
| `ClayAnimatedButton` | `Button` | Variants, sizes, loading state, icon slots |
| `ClaySpinner` | `Spinner` | Indeterminate loading |
| `ClayFeatureCard` | `Card` (Header/Title/Description/Footer) | Content surface |
| `ClayAnimatedCard` | `Card` + `AnimatedPressable` | Pressable card |
| `ClayAvatar` | `Avatar` | With initials fallback + badge |
| `TabBar` (custom pill) | **KEEP custom — re-wire to Uniwind** | User directive: our floating pill tab bar stays as-is, only its internal styling mechanism switches from NativeWind to Uniwind. PanelUI `Tabs` is content tabs, not navigation tabs — not a replacement. |
| `ui/input.tsx` | `Input` + `Field` + `Label` | Label, description, error |
| `ui/textarea.tsx` | `Textarea` | Multi-line text field |
| `ui/switch.tsx` | `Switch` | Animated toggle |
| `ui/radio.tsx` | `RadioGroup` | Single-select list |
| `ui/badge.tsx` | `Badge` | Status label, dot, notification count |
| `ui/card.tsx` | `Card` | Content surface |
| `ui/toggle-card.tsx` | `Card` + `Switch` or `Checkbox` | Selectable card |
| `ui/collapsible.tsx` | `Accordion` | Collapsible sections |
| `ui/reveal.tsx` | (no direct equivalent) | Keep as utility or remove if unused after screens migrate |
| `ui/glass-surface.tsx` | `Surface` | Elevated container |
| `ui/error-state.tsx` | `EmptyState` | Placeholder for no content |
| `ui/bottomsheet/` | **KEEP custom — rebuild on Uniwind** | User directive: our bottom sheet stays. Note: "drop `@expo/ui`" means reimplementing the sheet on gesture-handler + Reanimated (`@expo/ui/community/bottom-sheet` IS the sheet mechanics — drag, snap, presentation — not just styling). NOT swapped for PanelUI's `BottomSheet`. This is a mini-rebuild, the hairiest item in Phase 2. |
| `edge-blur.tsx` | `Scrim` + `ScrollFade` | Backdrop/scroll edge fade |
| `AutomationDmPreview.tsx` | `Message` + `MessageScroller` | **EXCEPTION:** intentionally hardcodes IG's palette (`#000000`, `#5B51D8`→`#C13584`) — simulates Instagram's UI, not Kaplun's. Stays as-is. |

### Custom Components Kept — TabBar & BottomSheet (user directive)

Two custom components survive the migration. They are **not** replaced by PanelUI equivalents — they are re-wired so their internals use Uniwind's `className` instead of NativeWind/`react-native-css`/`@expo/ui`:

- **`TabBar.tsx`** (floating pill, metallic rim, scroll-driven scale): no PanelUI equivalent (PanelUI `Tabs` is content tabs, not navigation tabs). Stays custom; every internal style call switches to Uniwind's `className`. `SymbolIcon` stays (SF Symbols are platform-native), `GlassSurface` is evaluated during the home screen migration (may swap for PanelUI `Surface`).
- **`ui/bottomsheet/`** (custom sheet wrapping `@expo/ui` + NativeWind under the hood): stays custom; **rebuilt** on `react-native-gesture-handler` + Reanimated (drop `@expo/ui` dependency — `@expo/ui/community/bottom-sheet` is the sheet mechanics, not just styling, so this is a mini-rebuild not a re-wire). The `Backdrop.tsx` sibling-of-Host quirk becomes irrelevant since `Host` is no longer used.

Both must pass the same per-screen acceptance criteria and be included in Phase 2 scope. They are nav/overlay infrastructure, not content components — PanelUI does not replace them.

### TabBar — this stays custom (bottomsheet too)

### Acceptance Criteria (per screen)

- [ ] Screen renders with PanelUI components
- [ ] All interactions work (navigation, forms, toggles)
- [ ] Light/dark theme switching works
- [ ] No `as any`, `@ts-ignore`, or `@ts-expect-error` introduced
- [ ] `tsc --noEmit` passes
- [ ] Adjacent tests pass

## Phase 3 — Cleanup

**Goal:** Remove all dead code from the old system.

### Steps

1. **Move TabBar out of `clay/`** — `src/components/clay/` contains `TabBar.tsx` + `TabBar.test.tsx` + `AGENTS.md` in addition to the 6 Clay components. TabBar is a "keep" hard requirement (user directive). Move `TabBar.tsx` + `TabBar.test.tsx` to a new home (e.g. `src/components/tab-bar/`) before deleting `clay/`.
2. **Swap `_layout.tsx`'s `ClaySpinner` → PanelUI `Spinner`** — `src/app/_layout.tsx` (L23) imports `ClaySpinner` for the loading gate. `_layout.tsx` is not one of the 10 Phase-2 screens, so no migration task covers it. Do this swap before deleting `clay/`.
3. Delete `src/components/clay/` (6 Clay components, 8 source files incl. `.web.tsx` variants) — TabBar already moved in step 1
4. Delete `src/components/ui/` form kit (11 primitives) — except the custom `bottomsheet/` which is kept and re-wired (user directive). `ui/glass-surface.tsx` deletion is separate (step 13).
5. Delete `src/hooks/useClayAnimations.ts`
6. Remove Clay compound utilities from `src/tw/cn.ts` (`clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase`)
7. Slim `@/tw/index.tsx` — reduce to `cn()` re-export + `Image` + `AnimatedView` if no screens import primitives from it anymore. Also delete `AnimatedScrollView` (dead export, zero importers) during this slim.
8. Slim `src/lib/theme.ts` — remove `useThemeColors()` if no raw-RN escape hatches remain; guard `score/share-card.tsx`'s direct `lightColors` import (migrate its palette first, then remove the maps)
9. **Remove `@expo/ui` package + jest mocks** — all 4 importers (`ui/switch.tsx`, `bottomsheet/index.tsx`, `automate/index.tsx`, `automate/new/index.tsx`) are migrated by end of Phase 2. Remove from `package.json` and delete `__mocks__/@expo/ui`.
10. Update all AGENTS.md + docs to reflect PanelUI adoption:
   - Root `AGENTS.md` — update stack table, anti-patterns, theme system notes
   - `src/components/AGENTS.md` — document PanelUI as the component library
   - `src/components/clay/AGENTS.md` — delete (directory removed)
   - `src/tw/AGENTS.md` — document simplified bridge
   - `src/app/AGENTS.md` — update provider stack
   - `src/screens/AGENTS.md` — update styling rules
   - `DESIGN.md` — rewrite design manual for PanelUI tokens + custom AMOLED variant (was missed)
   - `src/lib/AGENTS.md` — update theme section (was missed)
   - `src/hooks/AGENTS.md` — update useClayAnimations section (was missed)
11. Update `scripts/check-structure.mjs` — remove Clay-related rules, update raw-RN import exception list
12. Delete `src/components/edge-blur.tsx` (replaced by PanelUI `Scrim`)
13. Delete `src/components/ui/glass-surface.tsx` (replaced by PanelUI `Surface`)
14. Remove `react-native-css` and `nativewind` from `package.json` (if not already removed in Phase 1)

### Acceptance Criteria

- [ ] No files in `src/components/clay/`
- [ ] No files in `src/components/ui/` (except any that serve a purpose PanelUI doesn't cover)
- [ ] No references to `useCssElement` anywhere
- [ ] No references to `VariableContextProvider` anywhere
- [ ] No references to `cssVariablesForScheme` anywhere
- [ ] `tsc --noEmit` passes
- [ ] `npx jest` passes
- [ ] App boots and all screens render

## Risks and Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Uniwind free lacks a feature NativeWind v5 had | Medium | Uniwind is a drop-in replacement with full Tailwind v4 support. If a specific feature is missing, it can be worked around with inline styles or `style` props. |
| PanelUI components don't render on web | Medium | PanelUI components are pure TypeScript. If any fail on web, address per-component with `.web.tsx` fallbacks. Web is a secondary target. |
| `@/tw` bridge simplification breaks existing screens | Low-Medium | Phase 1 keeps `@/tw` as thin re-exports — the import path and API (`className` prop) stay identical. Uniwind handles `className` on raw RN components, so the behavior is equivalent. |
| Theme token mismatch causes visual regression in Phase 1 | High (expected) | This is expected and accepted. Phase 1 gets the app booting; Phase 2 restyles each screen with PanelUI components. Phase 1 visual state is a known intermediate. |
| `react-native-worklets` / `react-native-svg` require new EAS build | Certain | Already planned in Phase 1 step 12. JS-only work can ship via Metro until the build is ready. Only `react-native-svg` is a new native dep — `react-native-worklets` is already installed (Reanimated 4 runtime). |
| `AutomationDmPreview` hardcodes IG colors — conflicts with PanelUI theme | None | This component is explicitly excluded from migration. It simulates Instagram's UI, not Kaplun's. |
| Custom `ui/bottomsheet/` rebuild is non-trivial — wraps `@expo/ui/community/bottom-sheet` which IS the sheet mechanics (drag, snap, presentation), not just styling | High | "Drop `@expo/ui`" while "keep custom, not PanelUI's BottomSheet" means reimplementing the sheet on `react-native-gesture-handler` + Reanimated — a mini-rebuild, not a re-wire. Both custom components (TabBar + bottomsheet) get an explicit, dedicated Phase 2 work item. The `Host` wrapper and `Backdrop` sibling-of-Host quirk disappear. Acceptance: runs like before. Schedule realistically — this is the hairiest item in Phase 2. |
| `TabBar` render is complex (floating pill, metallic rim, scroll-driven scale) | Medium | Keep behavior — swap style mechanism. Test via adjacent tests + visual check. |
| Clay deletion breaks something not traced | Medium | Phase 3 step-by-step grep before each delete — trace all `useThemeColors()`/`lightColors` callers first, then `grep -r 'clay/' src/`, `grep -r 'useCssElement' src/`, `grep -r 'ClaySpinner\|ClayAvatar\|ClayFeatureCard\|ClayAnimated' src/`. Do NOT delete until grep returns zero hits outside the directory being deleted. |
| `AutomationDmPreview`'s `ClayAvatar` import breaks when `clay/` deleted | Medium| During the messages thread migration (Phase 2 screen #4), swap `ClayAvatar` → PanelUI `Avatar` in `AutomationDmPreview.tsx`. The component is otherwise unchanged (IG palette). Then Phase 3 deletion is safe. |

## What Stays Unchanged

- **Backend (`api-go/`):** No changes. This is a frontend-only migration.
- **Data layer:** `src/lib/repository.ts`, `src/hooks/` (React Query hooks) — unchanged.
- **Instagram integration:** `src/lib/instagram.ts` — unchanged.
- **Auth flow:** `src/hooks/useAuthFlow.ts` — unchanged (only the AuthScreen UI changes in Phase 2).
- **Session/bridge context:** `src/lib/session-context.tsx`, `src/lib/bridge-context.tsx` — unchanged.
- **Reanimated web stubs:** `metro.config.js` resolveRequest override for web — stays.
- **Reanimated platform wrapper:** `src/lib/reanimated-platform.ts` — stays.
- **`AutomationDmPreview.tsx`:** Stays as-is (intentional IG palette hardcoding).
- **`SymbolIcon`:** Stays (SF Symbols are platform-native).
- **Appwrite, React Query, AsyncStorage, NetInfo** — all unchanged.

## Dependencies: Before → After

### Removed
- `nativewind` (^5.0.0-preview.4)
- `react-native-css` (^3.0.7)

### Added
- `uniwind` (latest, MIT)
- `panelui-native` (latest) — pulls `lucide-react-native` + `tailwind-variants` + `clsx` as runtime deps (pure JS)
- `react-native-svg` (15.0.0+, for PanelUI charts/icons/loaders)

### Already Installed (no change)
- `react-native-reanimated` (4.5.0)
- `react-native-worklets` (0.10.0 — Reanimated 4's runtime, already native; NOT a new native dep)
- `react-native-gesture-handler` (~2.32.0)
- `react-native-safe-area-context` (~5.7.0)
- `@react-native-masked-view/masked-view` (0.3.2)
- `expo-linear-gradient` (~57.0.1)
- `expo-blur` (~57.0.2)
- `expo-haptics` (~57.0.1)
- `@expo/ui` (~57.0.9)
- `tailwindcss` (^4)
- `tailwind-merge` (^3.6.0)
- `@tailwindcss/postcss` (^4.3.3)

### Optional (install when needed)
- `expo-clipboard` — for `useCopyToClipboard` hook
- `react-native-keyboard-controller` — for keyboard avoidance on Android
- `expo-file-system` + `react-native-view-shot` — for Signature export (**`react-native-view-shot` 5.1.0 already installed**)
