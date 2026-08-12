# src/tw/ — Styling Primitives

5 files: thin re-exports of React Native components. Uniwind handles `className` natively on RN components — no bridge layer needed.

## STRUCTURE

| File | Exports | Mechanism |
|------|---------|-----------|
| `index.tsx` | `View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `TouchableHighlight`, `Link`, `useCSSVariable` | Thin re-exports of RN components. Uniwind resolves `className` → `style`. `ScrollView` wraps with `contentContainerClassName` support. `Link` re-exports `expo-router`'s `Link`. |
| `cn.ts` | `cn(...inputs)`, `sheetContent` | `twMerge(clsx(inputs))`. `sheetContent` is a padding utility for bottom sheet interiors. |
| `image.tsx` | `Image` | Thin re-export of RN `Image`. |
| `animated.tsx` | `AnimatedView`, `useShakeAnimation` | Native: `Animated.createAnimatedComponent(View)`. `useShakeAnimation` provides error-shake feedback. |
| `animated.web.tsx` | `AnimatedView`, `useShakeAnimation` | Web: plain `View` (no Reanimated — avoids #8285). `useShakeAnimation` uses fallback no-ops from `@/lib/reanimated-platform`. |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Use a styled component | `import { View, Text, Pressable } from '@/tw'` — `className` prop works via Uniwind |
| Merge conditional classes | `import { cn } from '@/tw/cn'` — `cn('base', condition && 'extra')` |
| Use an image | `import { Image } from '@/tw/image'` (NOT `expo-image` or RN `Image`) |
| Use an animated view | `import { AnimatedView } from '@/tw/animated'` (platform-specific — web gets plain View) |
| Shake animation | `import { useShakeAnimation } from '@/tw/animated'` — returns `{ shake, animatedStyle }` |
| Read a CSS variable | `import { useCSSVariable } from '@/tw'` — `useCSSVariable('--color-background')` |

## CONVENTIONS

- **Uniwind native className** — Uniwind resolves `className` on RN components at runtime. No `useCssElement` bridge needed.
- **`.web.tsx` for Reanimated safety** — `animated.tsx` (native: Reanimated) + `animated.web.tsx` (web: plain View). Metro resolves `.web.tsx` on web platform.
- **`@/tw` is the import path** — `@/tw` resolves to `src/tw/index.tsx`. `@/tw/cn`, `@/tw/image`, `@/tw/animated` are explicit subpaths.
- **Theming via PanelUI** — `className` components re-theme at runtime via PanelUI's `PanelUIProvider` in `src/app/_layout.tsx`. Use `useCSSVariable('--color-*')` for raw-RN color access (system chrome, gradient scrims).

## ANTI-PATTERNS

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives so `className` works. Allowed without exception: `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`, `StyleProp`, `ViewStyle`, `NativeScrollEvent` (no `@/tw` equivalents). Files outside this allowed set must be listed in the escape-hatch exception list in `scripts/check-structure.mjs`.
- **NO `StyleSheet.create()` in screens** — use Tailwind `className` via `@/tw` primitives.
- **NO `expo-image` or RN `Image` direct imports** — use `@/tw/image`.
- **NO `react-native-reanimated` direct import** — use `@/tw/animated` or `@/lib/reanimated-platform`.
- **NO `useThemeColors()`** — removed in Phase 3. Use `useCSSVariable('--color-*')` for raw-RN color access.
- **Documented raw-RN escape hatches** (must match `scripts/check-structure.mjs` EXCEPTIONS):
  - `src/components/auth/AuthScreen.tsx` — `UIManager` + `useWindowDimensions` for platform layout animations
  - `src/components/ui/bottomsheet/index.tsx` — `Modal`, `useWindowDimensions` for sheet mechanics
  - `src/components/ui/bottomsheet/backdrop.tsx` — `StyleSheet`, `useWindowDimensions` for backdrop
  - `src/screens/automate/new/index.tsx` — `Keyboard`, `LayoutAnimation`, `UIManager` for form layout
