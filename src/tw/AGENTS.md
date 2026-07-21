# src/tw/ — Styling Primitives

5 files: className-enabled React Native wrappers via `react-native-css`'s `useCssElement`. This is the bridge between NativeWind v5 Tailwind classes and RN `style` props.

## STRUCTURE

| File | Exports | Mechanism |
|------|---------|-----------|
| `index.tsx` | `View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `TouchableHighlight`, `Link`, `AnimatedScrollView`, `useCSSVariable` | Each wraps RN component with `useCssElement(Comp, props, { className: 'style' })`. `Link` wraps `expo-router`'s `Link`. |
| `cn.ts` | `cn(...inputs)` | `twMerge(clsx(inputs))`. Compound utilities: `clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase`. |
| `image.tsx` | `Image` | `useCssElement(RNImage, props, { className: 'style' })` |
| `animated.tsx` | `AnimatedView` | Native: `Animated.createAnimatedComponent(View)`. Reanimated-backed. |
| `animated.web.tsx` | `AnimatedView` | Web: plain `View` (no Reanimated — avoids #8285). |

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Use a styled component | `import { View, Text, Pressable } from '@/tw'` — `className` prop works |
| Merge conditional classes | `import { cn } from '@/tw/cn'` — `cn('base', condition && 'extra')` |
| Use an image | `import { Image } from '@/tw/image'` (NOT `expo-image` or RN `Image`) |
| Use an animated view | `import { AnimatedView } from '@/tw/animated'` (platform-specific — web gets plain View) |
| Add a new styled primitive | Wrap RN component with `useCssElement` in `index.tsx`, following the existing pattern |
| Fix Android layout bug | If `useCssElement` causes layout issues, switch that component to raw RN + `StyleSheet.create()` (see ClayAnimatedButton for precedent) |

## CONVENTIONS

- **`useCssElement` bridge** — `useCssElement(RNComponent, props, { className: 'style' })` maps `className` → `style` prop. This is NOT standard NativeWind `styled()` — it's a `react-native-css` API.
- **`.web.tsx` for Reanimated safety** — `animated.tsx` (native: Reanimated) + `animated.web.tsx` (web: plain View). Metro resolves `.web.tsx` on web platform.
- **Compound utilities in `cn.ts`** — `clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase` are pre-built class strings. Use these instead of re-typing.
- **`@/tw` is the import path** — `@/tw` resolves to `src/tw/index.tsx`. `@/tw/cn`, `@/tw/image`, `@/tw/animated` are explicit subpaths.

## ANTI-PATTERNS

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives so `className` works. Exceptions: `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView` (no `@/tw` equivalents), and components that explicitly avoid NativeWind for Android layout stability (ClayAnimatedButton, ClaySpinner, AuthScreen).
- **NO `StyleSheet.create()` in screens** — use Tailwind `className` via `@/tw` primitives. `StyleSheet.create()` bypasses the CSS runtime and breaks theming.
- **NO `expo-image` or RN `Image` direct imports** — use `@/tw/image` for className support.
- **NO `react-native-reanimated` direct import for `AnimatedView`** — use `@/tw/animated` (platform-specific).
