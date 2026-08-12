# Phase 2 — BottomSheet Rebuild Report

**Date:** 2026-08-13
**Spec:** `docs/superpowers/specs/2026-08-12-panelui-migration-design.md` (lines 226-234)
**Branch:** ui/dark-theme

## Summary

Rebuilt the custom `BottomSheet` on `react-native-gesture-handler` + Reanimated, dropping the `@expo/ui` dependency entirely. The sheet mechanics (drag, snap, presentation) are now handled by `Gesture.Pan` + `useSharedValue`/`useAnimatedStyle`/`withTiming`/`withSpring` — not by `@expo/ui/community/bottom-sheet`.

## Files Modified

| File | Change |
|------|--------|
| `src/components/ui/bottomsheet/index.tsx` | Full rebuild: dropped all `@expo/ui` imports (Host, ExpoBottomSheet, ExpoBottomSheetModal, BottomSheetView/ScrollView/FlatList/SectionList/TextInput, BottomSheetModalProvider, useBottomSheet). Rebuilt `BottomSheetModal` on `Gesture.Pan` + Reanimated + RN `Modal`. `BottomSheetView` is now a simple `@/tw` `View` wrapper. Replaced `useThemeColors()` with `useCSSVariable('--color-background')`. Dropped `useThemeMode` (no longer needed — no `Host` colorScheme). |
| `src/components/ui/bottomsheet/backdrop.tsx` | Rebuilt on Reanimated: `useSharedValue`/`useAnimatedStyle`/`withTiming`/`runOnJS` from `@/lib/reanimated-platform` replacing RN `Animated`/`Easing`. Kept `BlurView`/`LiquidGlassView` from `@sbaiahmed1/react-native-blur`. Dim layer uses `@/tw` `View`. |
| `src/components/ui/bottomsheet/header.tsx` | Replaced `useThemeColors()` with `useCSSVariable('--color-foreground')` for the Ionicons close button color. |
| `src/components/ui/bottomsheet/index.test.tsx` | Removed `jest.mock('@expo/ui/community/bottom-sheet')` — no longer needed. |
| `jest.setup.ts` | Added `Gesture` (Pan/Tap/Native with chainable mock methods) and `GestureDetector` (passthrough) to the `react-native-gesture-handler` mock. Updated `withTiming`/`withSpring` mocks to call the completion callback (matching `@/lib/reanimated-platform`'s fallback behavior). |

## Architecture

### BottomSheetModal

- **Overlay:** RN `Modal` (transparent, `animationType="none"`) — replaces `@expo/ui`'s `Host` + native sheet presentation.
- **Imperative API:** `forwardRef` + `useImperativeHandle` exposing `present()` / `dismiss()`. `present()` sets `visible=true` and animates `translateY` to 0. `dismiss()` animates `translateY` to `sheetHeight` then sets `visible=false` via `withTiming` callback + `runOnJS`.
- **Snap points:** Parsed from percentage strings (e.g. `'40%'`) to pixel heights via `useWindowDimensions`. Sheet height = max snap point.
- **Drag gesture:** `Gesture.Pan()` from `react-native-gesture-handler`. `onUpdate` tracks `translateY` (clamped to ≥0). `onEnd` dismisses if dragged past 30% of sheet height or velocity > 500, otherwise springs back to 0.
- **Backdrop fade-out:** `closing` state keeps the `Modal` mounted during the dismiss animation so the backdrop can fade out before unmount.
- **GestureHandlerRootView:** Wraps modal content (required for gestures inside RN `Modal`).
- **Background color:** `useCSSVariable('--color-background')` — AMOLED black in dark, cream in light.
- **Drag handle:** Visual grabber bar (`h-1.5 w-10 rounded-full bg-muted-foreground/30`).

### BottomSheetBackdrop

- Rebuilt on Reanimated: `useSharedValue` for opacity, `useAnimatedStyle` for animated opacity style, `withTiming` for fade in/out.
- Mount/unmount lifecycle preserved: mounts immediately when `visible=true`, unmounts after fade-out animation completes (via `withTiming` callback + `runOnJS(setMounted)(false)`).
- `BlurView`/`LiquidGlassView` from `@sbaiahmed1/react-native-blur` kept as-is (not `@expo/ui`).
- Dim layer (`rgba(0,0,0,0.35)`) uses `@/tw` `View`.

### BottomSheetHeader

- `useThemeColors().ink` → `useCSSVariable('--color-foreground')` for the Ionicons close button color.
- All other styling unchanged (already uses `@/tw` primitives + Tailwind `className`).

## Exports Preserved

- `BottomSheetModal` (used by home screen + test)
- `BottomSheetView` (used by home screen + test)
- `BottomSheetHeader` + `BottomSheetHeaderProps` (used by home screen)
- `BottomSheetMethods` type (used by test)
- `BottomSheetProps`, `BottomSheetViewProps` types

## Exports Dropped (unused — verified via grep)

- `BottomSheet` (non-modal default export) — not imported anywhere
- `BottomSheetScrollView`, `BottomSheetFlatList`, `BottomSheetSectionList`, `BottomSheetTextInput` — not imported anywhere
- `BottomSheetModalProvider` — not imported anywhere
- `useBottomSheet` — not imported anywhere
- Types: `BottomSheetHandleProps`, `BottomSheetBackdropProps`, `BottomSheetBackgroundProps`, `BottomSheetFooterProps` — not imported anywhere

## Verification

- `bun run lint` (tsc --noEmit): **PASS**
- `npx jest --testPathPattern=bottomsheet --forceExit`: **2/2 PASS**
- `npx jest --testPathPattern=home --forceExit`: **24/24 PASS** (home screen uses BottomSheetModal)
- Full suite `npx jest --forceExit`: **277/279 PASS** — only 2 pre-existing failures in `ui-components.test.tsx` (documented in AGENTS.md as known Input style assertion failures from mocked CSS runtime)

## Behavior Preserved

- Drag to dismiss (pan down past threshold or high velocity)
- Snap points (percentage-based height calculation)
- Backdrop dim + blur (BlurView/LiquidGlassView + dim layer)
- Backdrop fade in/out (Reanimated withTiming)
- Content rendering (children inside BottomSheetView)
- Haptic feedback on open (hapticImpactLight)
- Imperative present()/dismiss() via ref
- Android back button dismiss (Modal onRequestClose)
