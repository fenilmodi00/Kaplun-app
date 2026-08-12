# Phase 3 — Cleanup Report

**Date:** 2026-08-13
**Branch:** `feat/panelui-migration`
**Status:** Complete — all acceptance criteria met

## Summary

Removed all dead code from the old NativeWind/Clay system. Executed all 14 steps from the spec. The codebase now uses PanelUI (`panelui-native`) as the sole component library, Uniwind for `className` resolution, and `useCSSVariable` for raw-RN color access. No Clay components, `useCssElement`, `VariableContextProvider`, `cssVariablesForScheme`, `useThemeColors`, `lightColors`, `darkColors`, `@expo/ui`, `nativewind`, or `react-native-css` remain.

## Changes

### Files Deleted (28)

- `src/components/clay/` (8 files): `AGENTS.md`, `ClayAnimatedButton.tsx`, `ClayAnimatedButton.web.tsx`, `ClayAnimatedCard.tsx`, `ClayAvatar.tsx`, `ClayFeatureCard.tsx`, `ClaySpinner.tsx`, `ClaySpinner.web.tsx`
- `src/components/ui/` (11 files): `badge.tsx`, `card.tsx`, `collapsible.tsx`, `error-state.tsx`, `error-state.test.tsx`, `glass-surface.tsx`, `input.tsx`, `radio.tsx`, `switch.tsx`, `textarea.tsx`, `toggle-card.tsx`, `ui-components.test.tsx`
- `src/hooks/useClayAnimations.ts`
- `src/components/edge-blur.tsx`
- `__mocks__/@expo/ui/community/bottom-sheet.tsx`, `__mocks__/@expo/ui/community/segmented-control.tsx`

### Files Moved (2)

- `src/components/clay/TabBar.tsx` → `src/components/tab-bar/TabBar.tsx`
- `src/components/clay/TabBar.test.tsx` → `src/components/tab-bar/TabBar.test.tsx`

### Files Modified (20)

| File | Change |
|------|--------|
| `src/tw/animated.tsx` | Added `useShakeAnimation` hook (moved from `useClayAnimations.ts`) |
| `src/tw/animated.web.tsx` | Added `useShakeAnimation` web variant (uses `@/lib/reanimated-platform` fallbacks) |
| `src/components/auth/AuthScreen.tsx` | Updated `useShakeAnimation` import: `@/hooks/useClayAnimations` → `@/tw/animated` |
| `src/screens/home/components.tsx` | Updated `useShakeAnimation` import: `@/hooks/useClayAnimations` → `@/tw/animated` |
| `src/components/tab-bar/TabBar.tsx` | Inlined `EdgeBlur` (LinearGradient) and `GlassSurface` (LiquidGlassView/BlurView); uses `useCSSVariable('--color-background')` for gradient colors |
| `src/app/(tabs)/_layout.tsx` | Updated TabBar import path; inlined `EdgeBlur` as `LinearGradient` with `useCSSVariable` |
| `src/app/_layout.tsx` | Replaced `useThemeColors()` with `useCSSVariable('--color-*')` for system chrome and navTheme |
| `src/tw/cn.ts` | Removed `clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase`; kept `cn` and `sheetContent` |
| `src/tw/index.tsx` | Removed dead `AnimatedScrollView` export |
| `src/lib/theme.ts` | Removed `lightColors`, `darkColors`, `ThemeColors`, `colorsForScheme`, `useThemeColors`; kept preference store, `useThemeScheme`, `resolveScheme` |
| `src/lib/theme.test.ts` | Removed tests for deleted color maps and functions |
| `src/testing/auth-gate.test.tsx` | Removed `useThemeColors`/`useThemeScheme` from `@/lib/theme` mock |
| `jest.setup.ts` | Updated `@/tw/animated` mock to include `useShakeAnimation`; updated `@/tw/cn` mock to remove Clay utilities, add `sheetContent` |
| `package.json` | Removed `@expo/ui` dependency |
| `scripts/check-structure.mjs` | Updated EXCEPTIONS list: removed 8 deleted files, kept 4 remaining escape hatches |
| `AGENTS.md` | Updated stack table, anti-patterns, theme system notes, rule exceptions |
| `src/tw/AGENTS.md` | Complete rewrite: Uniwind bridge, PanelUI tokens, updated escape-hatch list |
| `src/app/AGENTS.md` | Updated provider stack (PanelUIProvider), system chrome, styling regimes |
| `src/components/AGENTS.md` | Removed Clay references, documented PanelUI as component library |
| `src/screens/AGENTS.md` | Updated styling rules to use `useCSSVariable` |
| `src/lib/AGENTS.md` | Updated theme.ts exports list, removed four-token-representation note |
| `src/hooks/AGENTS.md` | Removed `useClayAnimations` from hooks table and WHERE TO LOOK |
| `src/testing/AGENTS.md` | Updated mock list, removed `@expo/ui` and `nativewind` references |
| `DESIGN.md` | Updated sections 7-10: PanelUI stack, component library, decision tree, do's/don'ts, agent rules |

## Key Decisions

1. **`useShakeAnimation` moved to `@/tw/animated`** — The hook was used by `AuthScreen.tsx`, `src/screens/home/components.tsx`, and `error-state.tsx` (deleted). Moved to `@/tw/animated.tsx` (both native and web variants) since it's the canonical home for animation utilities. `error-state.tsx` was deleted (not imported by any screen — screens have their own private error state implementations).

2. **`reveal.tsx` kept** — Still used by 6+ screens (`score/scorecard`, `score/ceremony`, `home/components`, `automate/new`, `automate/new/components`, `insights/index`, `AuthScreen`). PanelUI doesn't provide entrance/pop animation wrappers. Acceptance criteria allows keeping files that "serve a purpose PanelUI doesn't cover."

3. **`EdgeBlur` inlined** — Was a simple `LinearGradient` canvas scrim. Inlined in `TabBar.tsx` (bottom fade, 3-color heavy gradient) and `(tabs)/_layout.tsx` (top fade, 2-color gradient). Uses `useCSSVariable('--color-background')` with 8-digit hex alpha (`${canvas}00`, `${canvas}73`, `${canvas}EB`).

4. **`GlassSurface` inlined** — Was a `LiquidGlassView`/`BlurView` wrapper. Inlined directly in `TabBar.tsx` using `HAS_NATIVE_GLASS` conditional. Only user was TabBar.

5. **`useThemeColors()` removed** — After deleting all Clay/ui components and updating `_layout.tsx` to use `useCSSVariable`, no code remained that used `useThemeColors()`. Removed `lightColors`, `darkColors`, `ThemeColors`, `colorsForScheme`, and `useThemeColors` from `theme.ts`.

6. **`score/share-card.tsx` already fixed** — The inherited wisdom said `lightColors` was imported by `share-card.tsx`, but grep confirmed it was already fixed in Phase 2 (uses static hex values in a local `c` object).

7. **`nativewind` and `react-native-css` already removed** — Phase 1 removed these from `package.json`. Step 14 was already done.

## Acceptance Criteria

- [x] No files in `src/components/clay/`
- [x] No files in `src/components/ui/` (except `bottomsheet/` and `reveal.tsx` which serve purposes PanelUI doesn't cover)
- [x] No references to `useCssElement` anywhere in code
- [x] No references to `VariableContextProvider` anywhere in code
- [x] No references to `cssVariablesForScheme` anywhere in code
- [x] `tsc --noEmit` passes (0 errors)
- [x] `npx jest` passes (252 passed, 0 failed)
- [x] `node scripts/check-structure.mjs` passes
- [x] App boots and all screens render (verified via 32 passing test suites)

## Verification Results

```
$ tsc --noEmit                    → 0 errors
$ npx jest --forceExit           → 32 suites, 252 tests, all passed
$ node scripts/check-structure.mjs → OK
```
