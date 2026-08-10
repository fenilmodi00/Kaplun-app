# src/components/ — Non-Clay Components

Scope: the `ui/` form kit, `auth/`, `automation/`, and 3 root-level components. The Clay design system lives in `clay/AGENTS.md` — this doc covers everything else.

## STRUCTURE

| Path | Role |
|------|------|
| `ui/` (10 primitives) | Self-made form/display kit: `card`, `badge`, `input`, `textarea`, `switch`, `radio`, `toggle-card`, `collapsible`, `reveal`, `glass-surface` |
| `auth/AuthScreen.tsx` | Login/signup OTP screen, 761 lines. Internal pieces: `CapsuleToggle`, `EmailField`, `PasswordInput`, `OTPInput`, `AuthShell`. Raw-RN StyleSheet exception |
| `automation/AutomationDmPreview.tsx` | Simulated IG DM inbox preview for the automation builder; `{username}` substitution; hardcoded IG colors by design |
| `edge-blur.tsx` | Canvas scrim — plain `LinearGradient`, NOT a real blur (native `expo-blur` crashed Android on transitions; `blurTarget`/`intensity` props kept for call-site compat) |
| `screen-shell.tsx` | Screen padding shell; exports `TAB_BAR_OVERLAY` used with `useSafeAreaInsets` so content clears the floating tab bar |
| `symbol-icon.tsx` | SF Symbol wrapper used by the tab bar |

## `ui/` KIT CONVENTIONS

- **className via `@/tw` + `cn()`** — variant/size maps are `Record<Type, string>` of Tailwind class strings.
- **Compound components via context** — `Input`/`Textarea` provide variant+size+state to their field children; `RadioGroup` → `Radio` → `RadioIndicator`/`RadioLabel` throw outside the provider.
- **`forwardRef` only on field inputs** — `InputField`/`TextareaInput` expose imperative `focus`/`blur`/`clear`/`setText`.
- **StyleSheet exception is font-metric driven** — `input.tsx`/`textarea.tsx` use `StyleSheet.create()` because Tailwind typography tokens balloon line-height on Android. This is intentional, not debt.
- **Theming** — raw-RN pieces read `useThemeColors()`; `@expo/ui` components must be wrapped in `<Host colorScheme={useThemeScheme()}>` (see `switch.tsx`) so native material follows the app scheme.
- **Reanimated only via `@/lib/reanimated-platform`** — `collapsible.tsx`/`reveal.tsx` guard web with `IS_REANIMATED_AVAILABLE` (web inits at final state).
- **Accessibility** — `accessibilityRole`/`accessibilityState`/`accessibilityLabel`/`testID` throughout (see `radio.tsx` for the pattern).
- **`glass-surface.tsx`** — iOS 26+: `LiquidGlassView` with `glassType="clear"`, no tint; Android/older iOS: `BlurView blurType="dark"` directly — do NOT route Android through `LiquidGlassView`, its hardcoded `regular` fallback is a ~14% white frost that turns the pill milky. Pure clear glass in BOTH schemes (intentional); `#151517` survives only as the reduced-transparency fallback; floating chrome only, never full-screen cards.

## GOTCHAS

- `AuthScreen.tsx` is a documented raw-RN exception and a large-file hotspot — prefer targeted edits.
- `AutomationDmPreview` intentionally hardcodes IG's own palette (`#000000`, `#5B51D8`→`#C13584`) — it simulates Instagram's UI, not Kaplun's; do not migrate it to theme tokens.
