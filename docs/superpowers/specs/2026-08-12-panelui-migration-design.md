# PanelUI Migration Design

**Date:** 2026-08-12
**Status:** Draft — awaiting user review
**Branch:** `ui/dark-theme` (current)

## Summary

Replace Kaplun's custom styling stack (NativeWind v5 + `react-native-css` + Clay design system + custom `ui/` kit) with **Uniwind (free, MIT)** + **PanelUI** (`panelui-native` package). Adopt PanelUI's default theme. Migrate screen-by-screen from custom components to PanelUI's 130+ component library. Drop the Clay visual language.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Tailwind engine | Uniwind FREE (MIT, $0) | Drop-in NativeWind replacement, 2-5x faster, no Babel preset, Expo Go compatible, PanelUI's native engine |
| Component source | PanelUI package (`panelui-native`) | Full 130+ component library, updates via version bump, designed for Uniwind pipeline |
| Clay design system | Abandon — adopt PanelUI default theme | User decision; eliminates custom maintenance burden, gets consistent themed components |
| Migration strategy | Phased — engine first, then screen-by-screen | Lower risk, shippable at each phase boundary |
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

1. **Install packages:** `uniwind`, `react-native-worklets`, `react-native-svg`, `panelui-native`
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
5. **Simplify `src/tw/index.tsx`:** remove `useCssElement` imports and wrappers; thin re-export RN components
6. **Replace root provider in `src/app/_layout.tsx`:**
   - Replace `VariableContextProvider` with `PanelUIProvider` from `panelui-native`
   - `PanelUIProvider` owns: gesture handler root, themed page background, portal host (for overlays), toast viewport
   - Feed Expo Router's `ThemeProvider` from PanelUI tokens via `useCSSVariable()` (per PanelUI's Expo Router guide)
7. **Replace theme switching:**
   - Replace `useThemeScheme()` / `hydrateThemePreference()` with `useThemeMode()` from `panelui-native`
   - Replace `cssVariablesForScheme()` — Uniwind handles theme switching without a React context wrapper
   - System chrome (StatusBar, NavigationBar, SystemUI): read background color from `useCSSVariable('--color-background')`
8. **Adapt `src/lib/theme.ts`:**
   - Remove `lightCssVariables` / `darkCssVariables` / `cssVariablesForScheme`
   - Remove `hydrateThemePreference` (PanelUI handles persistence)
   - Keep `useThemeColors()` temporarily for raw-RN escape hatches (components still using `StyleSheet.create()`)
   - `useThemeColors()` implementation: read from `useCSSVariable()` instead of hardcoded `lightColors`/`darkColors` maps
9. **Verify:** app boots, existing screens render. Visual appearance will shift — Clay tokens replaced by PanelUI tokens. This is expected; screens get restyled in Phase 2.
10. **New EAS development build:** required because `react-native-worklets` and `react-native-svg` are new native dependencies.

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

### Per-Screen Migration Process

For each screen:
1. Read the current screen implementation
2. Identify all custom components used (`@/tw` primitives, Clay components, `ui/` kit)
3. Map each to PanelUI equivalent (see Component Mapping below)
4. Rewrite the screen using PanelUI components
5. Remove now-unused custom component imports
6. Verify: screen renders, interactions work, theme switching works
7. Run adjacent tests
8. Commit

### Component Mapping

| Kaplun custom | PanelUI replacement | Notes |
|---------------|---------------------|-------|
| `ClayAnimatedButton` | `Button` | Variants, sizes, loading state, icon slots |
| `ClaySpinner` | `Spinner` | Indeterminate loading |
| `ClayFeatureCard` | `Card` (Header/Title/Description/Footer) | Content surface |
| `ClayAnimatedCard` | `Card` + `AnimatedPressable` | Pressable card |
| `ClayAvatar` | `Avatar` | With initials fallback + badge |
| `TabBar` (custom pill) | Custom wrapper around PanelUI primitives | PanelUI `Tabs` is content tabs, not navigation tabs — the floating pill tab bar stays custom, restyled with PanelUI tokens |
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
| `ui/bottomsheet/` | `BottomSheet` | Draggable sheet |
| `edge-blur.tsx` | `Scrim` + `ScrollFade` | Backdrop/scroll edge fade |
| `AutomationDmPreview.tsx` | `Message` + `MessageScroller` | **EXCEPTION:** intentionally hardcodes IG's palette (`#000000`, `#5B51D8`→`#C13584`) — simulates Instagram's UI, not Kaplun's. Stays as-is. |

### TabBar Special Case

PanelUI has no floating pill tab bar component. The custom `TabBar.tsx` (Instagram-style pill, metallic rim, scroll-driven scale) stays as a custom component but gets restyled to use PanelUI theme tokens instead of Clay tokens. The `SymbolIcon` and `GlassSurface` dependencies are evaluated during the home screen migration — `GlassSurface` may be replaced by PanelUI's `Surface`, and `SymbolIcon` stays as-is (SF Symbols are platform-native).

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

1. Delete `src/components/clay/` (6 components, 8 files incl. `.web.tsx` variants)
2. Delete `src/components/ui/` form kit (11 primitives + bottomsheet kit — replaced by PanelUI equivalents)
3. Delete `src/hooks/useClayAnimations.ts`
4. Remove Clay compound utilities from `src/tw/cn.ts` (`clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase`)
5. Slim `@/tw/index.tsx` — reduce to `cn()` re-export + `Image` + `AnimatedView` if no screens import primitives from it anymore
6. Slim `src/lib/theme.ts` — remove `useThemeColors()` if no raw-RN escape hatches remain; remove `lightColors`/`darkColors` maps
7. Update all AGENTS.md files to reflect PanelUI adoption:
   - Root `AGENTS.md` — update stack table, anti-patterns, theme system notes
   - `src/components/AGENTS.md` — document PanelUI as the component library
   - `src/components/clay/AGENTS.md` — delete (directory removed)
   - `src/tw/AGENTS.md` — document simplified bridge
   - `src/app/AGENTS.md` — update provider stack
   - `src/screens/AGENTS.md` — update styling rules
8. Update `scripts/check-structure.mjs` — remove Clay-related rules, update raw-RN import exception list
9. Delete `src/components/edge-blur.tsx` (replaced by PanelUI `Scrim`)
10. Delete `src/components/ui/glass-surface.tsx` (replaced by PanelUI `Surface`)
11. Remove `react-native-css` and `nativewind` from `package.json` (if not already removed in Phase 1)

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
| `react-native-worklets` / `react-native-svg` require new EAS build | Certain | Already planned in Phase 1 step 10. JS-only work can ship via Metro until the build is ready. |
| `AutomationDmPreview` hardcodes IG colors — conflicts with PanelUI theme | None | This component is explicitly excluded from migration. It simulates Instagram's UI, not Kaplun's. |
| PanelUI `BottomSheet` differs from custom `@expo/ui` bottom sheet | Medium | PanelUI's `BottomSheet` is its own implementation (draggable sheet). The custom `ui/bottomsheet/` kit (wrapping `@expo/ui`) gets replaced during the messages screen migration. The `Backdrop.tsx` sibling-of-Host quirk (quirk memory) becomes irrelevant. |
| `TabBar` has no PanelUI equivalent | Medium | The floating pill tab bar stays custom, restyled with PanelUI tokens. This is a navigation component, not a content component — PanelUI's `Tabs` serves a different purpose. |

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
- `panelui-native` (latest)
- `react-native-worklets` (Reanimated 4's runtime, peer dep of PanelUI)
- `react-native-svg` (15.0.0+, for PanelUI charts/icons/loaders)

### Already Installed (no change)
- `react-native-reanimated` (4.5.0)
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
- `expo-file-system` + `react-native-view-shot` — for Signature export
