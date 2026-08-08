# src/components/clay/ — Clay Design System

6 components (8 files incl. `.web.tsx` variants) implementing the Clay visual language: cream canvas (`#fffaf0`), saturated single-color cards, dark-navy CTAs, Inter display type, claymation press animations. Lineage: Clay design language (see user skill `Clay-design-analysis`).

## STRUCTURE

| Component | File | LOC | `@/tw`? | Reanimated? | `.web.tsx`? |
|-----------|------|-----|---------|-------------|-------------|
| `TabBar` | `TabBar.tsx` | ~162 | Yes (View, Pressable) | Yes — via `@/lib/reanimated-platform` (minimize-on-scroll); also `SymbolIcon`, `hapticSelection`, `LiquidGlassView` | No (web = static no-op via platform fallback) |
| `ClaySpinner` | `ClaySpinner.tsx` | 78 | No — raw RN | Yes (withRepeat) | Yes (`.web.tsx` → ActivityIndicator) |
| `ClayFeatureCard` | `ClayFeatureCard.tsx` | 41 | Yes (View, Text) | Yes (useEntranceAnimation) | No |
| `ClayAvatar` | `ClayAvatar.tsx` | 13 | Yes (`@/tw/image`) | No | No |
| `ClayAnimatedCard` | `ClayAnimatedCard.tsx` | 36 | Yes (View, Pressable) | Yes (entrance + press) | No |
| `ClayAnimatedButton` | `ClayAnimatedButton.tsx` | 105 | No — raw RN | Yes (usePressAnimation) | Yes (`.web.tsx`) |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add a new Clay component | Decide `@/tw` (Tailwind classes) vs raw RN (StyleSheet — for Android layout-bug avoidance). Add `.web.tsx` variant if using Reanimated. |
| Change a Clay color | `src/global.css` `@theme` tokens (primary source). ALSO update hardcoded hex in raw-RN components: `ClayAnimatedButton.tsx:17-19`, `ClaySpinner.tsx:13-14`, `AuthScreen.tsx:52-57`. |
| Add a new animation | `src/hooks/useClayAnimations.ts` — `usePressAnimation`, `useShakeAnimation`, `useEntranceAnimation` |
| Add a new button variant | `ClayAnimatedButton.tsx` — update `variant` prop type + `COLORS` constant + `styles` map |
| Fix web animation crash | Add/fix `.web.tsx` variant — no Reanimated import, use plain RN |

## CONVENTIONS

- **`@/tw` vs raw RN split** — `@/tw`-based components (TabBar, ClayFeatureCard, ClayAnimatedCard, ClayAvatar) use Tailwind classes → theme tokens resolve automatically. Raw-RN components (ClaySpinner, ClayAnimatedButton) use `StyleSheet.create()` + hardcoded hex — explicitly to avoid NativeWind `useCssElement` layout bugs on Android (see comment `ClayAnimatedButton.tsx:15`).
- **`.web.tsx` variants** — components with Reanimated animations get a `.web.tsx` variant that uses plain RN (no Reanimated). Metro resolves `.web.tsx` on web platform. Required for #8285.
- **Compound utilities** — `clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase` in `src/tw/cn.ts`. Use these instead of re-typing class strings.
- **Animation hooks** — all Reanimated logic centralized in `src/hooks/useClayAnimations.ts`. Import from there, not from `react-native-reanimated` directly.
- **Canvas color** — `#fffaf0` defined in `global.css` as `--color-canvas`, hardcoded in `_layout.tsx:23` as `CANVAS` const, and duplicated in raw-RN components. Android nav bar also set to this via `expo-navigation-bar`.

## ANTI-PATTERNS

- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform` or the `useClayAnimations` hooks. (Currently violated by ClayAnimatedCard, ClayFeatureCard, ClayAnimatedButton, ClaySpinner — migrate these.)
- **NO new hex color values** — add colors to `src/global.css` `@theme` first. If a raw-RN component needs them, duplicate with a comment referencing the token.
- **NO `StyleSheet.create()` in `@/tw`-based components** — use Tailwind `className` + `cn()`. Raw-RN components are the exception, not the rule.
- **NO Reanimated in `.web.tsx` files** — web variants must be pure RN.

## KNOWN DEBT

- **Duplicated hex values** — `#fffaf0`, `#0a0a0a`, `#e5e5e5`, `#6a6a6a` hardcoded in ClaySpinner, ClayAnimatedButton, AuthScreen instead of referencing `global.css` tokens. Centralize when possible.
- **Direct reanimated imports** — ClayAnimatedCard, ClayFeatureCard, ClayAnimatedButton, ClaySpinner import `react-native-reanimated` directly instead of `@/lib/reanimated-platform`. Migrate to the platform wrapper.
