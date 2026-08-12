# Phase 2, Screen 9 — Auth Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Status:** Complete — all acceptance criteria met

## Summary

`src/components/auth/AuthScreen.tsx` now renders with PanelUI components (`Input`, `Button`, `OtpInput`, `Card` per the spec's replacement table, plus PanelUI `Text`). All auth business logic is preserved verbatim: mode/step gating, `canSubmit` computation, resend timer, 300 ms auto-verify timer, `handleContinue`/`handleVerify`/`handleResend`, `useAuthFlow` seam, and the shake-on-error effect. The `StyleSheet.create` block (~250 lines) and the hand-rolled 6-field OTP input are deleted. `useThemeColors` is gone; the two remaining raw color reads use `useCSSVariable` (shell canvas `--color-background`, password-eye tint `--color-muted-foreground`).

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| Raw `TextInput` (email) + focus/StyleSheet theming | PanelUI `Input` (`placeholder`, `autoCapitalize`/`keyboardType`/`autoComplete`/`textContentType` pass through, `className="h-11 rounded-xl"` keeps the 44 px Clay height) | PanelUI `forwardRef<TextInput>` keeps the shell's `ensureVisible(inputRef.current)` scroll-on-focus working unchanged. |
| Raw `TextInput` (password) + `Pressable` eye overlay | PanelUI `Input` + `endContent` eye (`Pressable` + `Ionicons`, `accessibilityLabel` show/hide) | Input measures `endContent` and pads text clear of it — the old absolute-position overlay and `paddingRight` hacks are gone. Focus border is PanelUI's internal animated ring. |
| Hand-rolled 6×`TextInput` OTP (per-cell focus mgmt, backspace nav, per-cell border theming) | PanelUI `OtpInput` (`length` default 6, `type="numeric"` default, `value`/`onChangeText`/`disabled`/`accessibilityLabel`) | Single hidden TextInput draws the cells — the old per-cell ref array, `handleChange` digit splicing and `handleKeyPress` backspace logic are deleted. Auto-verify still keys off `otpCode.length === 6` in the screen (300 ms debounce preserved), not `onComplete`. |
| Submit `Pressable` + `ActivityIndicator` + StyleSheet theming | `Button variant="primary" size="lg" fullWidth loading disabled testID="auth-continue"` | `loading` auto-blocks presses; the login/signup label crossfade survives as two absolutely-centered `AnimatedView` label layers gated to `!isLoading`. |
| `ClayAnimatedButton` (Verify, Google) | `Button variant="primary"` / `variant="social"` (`size="lg"`, `fullWidth`, `loading`) | `social` is PanelUI's third-party-sign-in variant. `loading` implies disabled, matching the old `disabled={isLoading}` gates. |
| Custom capsule toggle with animated pill | Same component, rebuilt on `@/tw` + `AnimatedView` + PanelUI `Text` | Pill still 250 ms `Easing.out(cubic)` slide; track `bg-secondary`, pill `bg-primary`, active label `text-primary-foreground`. |
| `StyleSheet.create` (24 style entries) | Tailwind classes on `@/tw` / PanelUI className props | `tracking-tight`≈old letterSpacing; compact breakpoints kept via ternary classes (`text-4xl`/`text-3xl`, `text-2xl`/`text-[22px]`). |
| `useThemeColors()` everywhere | Gone | All colors are PanelUI internals or `useCSSVariable`. |
| Card entrance `Animated.View entering={FadeInDown}` | `@/components/ui/reveal` `Reveal` (opacity+translateY, spring) | The reanimated-platform bridge has no FadeInDown export; `Reveal` is the established migrated-screen entrance (home pattern). Content is never invisible on web. |
| Transparent centered column on canvas | `Card className="w-full items-center p-6"` inside `Reveal` | Visual delta the spec explicitly orders (Card is in this screen's replacement row): auth panel now sits on a `bg-card` surface over `bg-background`. |
| Reanimated hooks from `react-native-reanimated` | `@/lib/reanimated-platform` + `AnimatedView` from `@/tw/animated` | House import rule now satisfied. |

## Intentionally kept

- **`AuthShell` keyboard choreography** — `Keyboard` listeners, `UIManager.measureInWindow` scroll-into-view, dynamic keyboard-height padding. This is the screen's deliberately engineered soft-keyboard behavior; PanelUI's `Input avoidKeyboard` was rejected because it wants the uninstalled `react-native-keyboard-controller` peer, and its fallback switches Android off `adjustResize` globally (same call-out as screen 4's report).
- **Raw RN value imports** (`findNodeHandle`, `Keyboard`, `KeyboardAvoidingView`, `Platform`, `UIManager`, `useWindowDimensions`) — shell mechanics only. All View/Text/Pressable/ScrollView/TextInput usage now flows through `@/tw` and PanelUI. `KeyboardAvoidingView`/`Platform` are in check-structure's allowed set; the rest are why the `AuthScreen.tsx` EXCEPTIONS entry must stay for now (see Open items).
- **`useAuthFlow`, `useShakeAnimation`, all timers/effects** — business logic, untouched.
- **`Ionicons`** — PanelUI has no eye glyph; home-screen precedent keeps Ionicons with `useCSSVariable` tinting.

## Files changed

| File | Change |
|---|---|
| `src/components/auth/AuthScreen.tsx` | Full UI-layer rewrite; 761 → ~520 LOC. Dead imports removed: `ActivityIndicator`, `Pressable`, `ScrollView`, `StyleSheet`, `Text`, `TextInput`, `View` from RN, `ClayAnimatedButton`, `CLAY_FONTS`, `useThemeColors`, direct `react-native-reanimated`. New: `Button`/`Card`/`Input`/`OtpInput`/`Text` from `panelui-native`, `@/tw` primitives, `useCSSVariable`, `Reveal`, `cn`. `testID="auth-continue"` added on the Continue button for the new test (repo's established `getByTestId` + `accessibilityState` assertion pattern). |
| `src/components/auth/AuthScreen.test.tsx` | New smoke test (3 cases): login form renders; Continue is disabled until a valid email then calls `submitEmailOTP`; OTP view renders and auto-verifies a complete code via `submitOTP`. Mocks `useAuthFlow` per-file per testing conventions. |
| `jest.setup.ts` | No net diff — `OtpInput` TextInput passthrough mock was already present at HEAD (added by a sibling screen session); my edit converged to identical content. Nothing staged. |

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (0 errors) |
| `npx jest --testPathPattern=auth --forceExit` | PASS — 5 suites, 19/19 |
| `npx jest` (full suite) | 277 passed / 2 failed — both are the documented pre-existing `ui-components.test.tsx` `Input` style assertions (unchanged baseline) |
| `node scripts/check-structure.mjs` | PASS — `AuthScreen.tsx` remains in EXCEPTIONS (see Open items) |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None (`as string` on `useCSSVariable` is the established screen-1 pattern) |
| Theme switching | All colors are PanelUI internals, semantic token classes, or `useCSSVariable` — follow `Uniwind.setTheme` by construction |

## Test-mock findings worth keeping

- **RN host normalization**: on the host element, Pressable's `disabled` surfaces as `accessibilityState: {disabled}` and `onPress` is consumed into responder handlers. Prop assertions on mocked PanelUI `Button` should read `accessibilityState.disabled`, not `props.disabled`.
- **Async flush**: after `fireEvent.changeText`, state-driven re-renders need `await waitFor(...)` before asserting; sync reads see the stale tree (same pattern the OTP auto-verify test uses).

## Open items for the orchestrator

- **`scripts/check-structure.mjs` untouched** — the task's MUST-NOT limits file changes to `src/components/auth/**` + `jest.setup.ts`, but spec step 6 says to drop each screen's raw-RN exception as it migrates. `AuthScreen.tsx` still imports `findNodeHandle`/`Keyboard`/`UIManager`/`useWindowDimensions` value bindings, so it genuinely still needs its EXCEPTIONS entry (unlike fully-migrated screens). Follow-up options: (a) leave the entry, or (b) in a later pass, replace the shell's keyboard machinery with native `automaticallyAdjustKeyboardInsets` + `adjustResize` and then remove the entry. Device QA should decide — the choreography exists to keep the Create Account button visible over the keyboard.
- **Visual delta is intentional but unpreviewed** — the auth form now sits on a `bg-card` panel (spec-mandated Card) instead of directly on canvas, and helper/title sizes moved to nearest scale steps (36→`text-4xl`, 22px compact title via arbitrary value, 13px helpers→`text-sm`). Eyeball light + dark, compact (iPhone SE class) and tall devices.
- **Device/keyboard QA not run** — type+test verification only. The Password eye `endContent`, capsule toggle pill slide, and OTP row centering deserve a quick manual pass on device.
- **`OtpInput` mock assumption** — the jest mock is a bare TextInput passthrough, so OtpInput-specific behaviors (cell drawing, `onComplete`, sanitize) are untested in unit land; the screen-level contract (value in / changeText out / disabled gate) is covered.
