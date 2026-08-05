# Kaplun Stack Implementation Guide

This file maps the stack-agnostic UI/UX Pro Max rules to the actual files, tokens, components, and patterns used in the Kaplun app. Read it alongside `src/global.css` and the relevant source files.

## Where Design Tokens Live

All tokens are declared in `src/global.css` inside `@layer theme { @theme { ... } }`. NativeWind v5 + Tailwind CSS v4 turn these into `className` utilities.

### Color tokens

| Semantic role | Token(s) | Tailwind class example |
|---|---|---|
| Canvas / background | `--color-canvas`, `--color-canvas-alt` | `bg-canvas`, `bg-canvas-alt` |
| Primary text / ink | `--color-ink`, `--color-body-strong`, `--color-body`, `--color-muted`, `--color-muted-soft` | `text-ink`, `text-body`, `text-muted` |
| Primary action (dark navy / near-black) | `--color-primary`, `--color-primary-active`, `--color-on-primary` | `bg-primary`, `text-on-primary`, `active:bg-primary-active` |
| Secondary surface | `--color-button-secondary`, `--color-button-secondary-hover` | `bg-button-secondary`, `hover:bg-button-secondary-hover` |
| Surface hierarchy | `--color-surface-soft`, `--color-surface-card`, `--color-surface-strong`, `--color-surface-dark`, `--color-surface-dark-elevated` | `bg-surface-card`, `bg-surface-dark`, `text-on-dark` |
| Hairlines / borders | `--color-hairline`, `--color-border-subtle`, `--color-border-strong` | `border-hairline`, `border-border-subtle` |
| Saturated feature-card accents | `--color-brand-pink`, `--color-brand-teal`, `--color-brand-lavender`, `--color-brand-peach`, `--color-brand-ochre`, `--color-brand-mint`, `--color-brand-coral` | `bg-brand-pink`, `text-brand-teal` |
| Semantic status | `--color-success`, `--color-warning`, `--color-error` | `text-success`, `bg-error` |

**Rule**: use these semantic tokens in `className`. Do not introduce raw hex values in components. If a color you need is missing, add it to `src/global.css` first.

### Typography tokens

| Role | Token | Tailwind class example |
|---|---|---|
| Display | `--text-display-xl` … `--text-display-sm` | `text-display-md font-display` |
| Title | `--text-title-lg`, `--text-title-md`, `--text-title-sm` | `text-title-lg` |
| Body | `--text-body-lg`, `--text-body-md`, `--text-body-sm` | `text-body-md` |
| Caption | `--text-caption`, `--text-caption-uppercase` | `text-caption` |
| Button | `--text-button` | `text-button` |
| Nav link | `--text-nav-link` | `text-nav-link` |

**Rule**: body text minimum is `text-body-sm` (14 px) for captions; normal body is `text-body-md` (16 px). Never use `< 12 px` for readable text.

### Radius tokens

| Token | Value | Use for |
|---|---|---|
| `--radius-xs` | 6 px | Tiny chips, badges |
| `--radius-sm` | 8 px | Small buttons, inputs |
| `--radius-md` | 12 px | Cards, medium buttons |
| `--radius-lg` | 16 px | Large cards, sheets |
| `--radius-xl` | 24 px | Hero cards, feature cards |
| `--radius-2xl` | 32 px | Large modals, bottom sheets |
| `--radius-pill` | 9999 px | Pills, badges, full-rounded buttons |

### Spacing tokens

| Token | Value | Use for |
|---|---|---|
| `--spacing-xxs` | 4 px | Tight internal gaps |
| `--spacing-xs` | 8 px | Default gap between related items |
| `--spacing-sm` | 12 px | Input internal padding |
| `--spacing-md` | 16 px | Screen horizontal insets, section base |
| `--spacing-lg` | 24 px | Section gaps |
| `--spacing-xl` | 32 px | Large section breaks |
| `--spacing-xxl` | 48 px | Hero spacing |
| `--spacing-section` | 96 px | Marketing-style section breaks (rare in app UI) |

## Primitives to Use

Import from `@/tw` instead of `react-native` directly:

```tsx
import { View, Text, Pressable, Image, ScrollView, TextInput } from '@/tw';
```

These are `className`-enabled wrappers around React Native components using `useCssElement`. They support Tailwind v4 utilities and the tokens above.

For animated primitives:

```tsx
import Animated from '@/lib/reanimated-platform';
// or
import { AnimatedView, AnimatedText } from '@/tw/animated';
```

**Rule**: never import `react-native-reanimated` directly.

## Clay Components

Prefer these before writing custom UI. Read each component's source to learn its props and styling constraints.

| Component | File | Use for |
|---|---|---|
| `ClayAnimatedButton` | `src/components/clay/ClayAnimatedButton.tsx` (+ `.web.tsx`) | Primary CTAs with press animation |
| `ClayAnimatedCard` | `src/components/clay/ClayAnimatedCard.tsx` | Tappable cards with press feedback |
| `ClayFeatureCard` | `src/components/clay/ClayFeatureCard.tsx` | Saturated single-color feature surfaces |
| `ClaySpinner` | `src/components/clay/ClaySpinner.tsx` (+ `.web.tsx`) | Loading indicator |
| `ClayAvatar` | `src/components/clay/ClayAvatar.tsx` | User/creator avatars |
| `ClayTabBar` | `src/components/clay/ClayTabBar.tsx` | Custom tab bar if needed |

**Rule**: if a Clay component already exists, reuse it. If you need a new Clay component, add it to `src/components/clay/` and provide a `.web.tsx` variant if it uses Reanimated.

## Icons

Always use `SymbolIcon` from `@/components/symbol-icon`:

```tsx
import { SymbolIcon } from '@/components/symbol-icon';

<SymbolIcon name="arrow-back" size={24} color="text-ink" />
```

It wraps Ionicons / SF Symbols. Choose `outline` or `filled` consistently within a screen.

**Rule**: no emoji as structural icons. No arbitrary icon libraries mixed in.

## Layout Patterns

### Safe areas

Use the helpers in `src/components/screen-shell.tsx` and Tailwind safe-area utilities:

```tsx
<View className="flex-1 bg-canvas pt-safe px-md">
  {/* content */}
  <View className="pb-safe" />
</View>
```

For fixed bottom CTAs:

```tsx
<View className="absolute bottom-0 left-0 right-0 bg-canvas pb-safe pt-sm px-md">
  <Pressable className="h-12 rounded-xl bg-primary">
    <Text className="text-center text-on-primary text-button font-display">Save</Text>
  </Pressable>
</View>
```

### Tab-bar clearance

`src/components/screen-shell.tsx` exports constants for tab-bar height and bottom clearance. Use them when calculating scroll content insets or fixed bottom bars.

### Scroll views

```tsx
import { ScrollView } from '@/tw';

<ScrollView className="flex-1" contentContainerClassName="px-md pb-32">
  {/* list content */}
</ScrollView>
```

Add bottom padding that clears fixed bars (`pb-32` is a safe starting point; verify against `screen-shell.tsx`).

### Lists

For 50+ items, use React Native `FlatList` (importing `FlatList` from `react-native` is the allowed exception). Provide `keyExtractor`, `getItemLayout` if items are fixed-height, and `ItemSeparatorComponent` for consistent spacing.

## Animation Patterns

### Reanimated imports

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, ReduceMotion } from '@/lib/reanimated-platform';
```

### Press feedback

Use `ClayAnimatedButton` or a small scale animation on `Pressable`:

```tsx
const scale = useSharedValue(1);
const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

<Pressable
  onPressIn={() => { scale.value = withTiming(0.96, { duration: 100 }); }}
  onPressOut={() => { scale.value = withSpring(1, { stiffness: 400, damping: 25 }); }}
>
  <Animated.View className="h-12 rounded-xl bg-primary" style={animatedStyle}>
    <Text className="text-center text-on-primary text-button font-display">Save</Text>
  </Animated.View>
</Pressable>
```

### Reduced motion

```tsx
import { ReduceMotion } from '@/lib/reanimated-platform';

withSpring(1, { reduceMotion: ReduceMotion.System });
```

### Web variant requirement

If a component uses worklets or Reanimated hooks, create `<Component>.web.tsx` using plain React Native `Animated` or static styles. Metro resolves `.web.tsx` on web automatically.

## Form Patterns

- Use `TextInput` from `@/tw`.
- Wrap forms in `KeyboardAvoidingView` from `@/tw` if needed.
- Show a visible label above the input, not placeholder-only.
- Show validation error below the field, not only at the top.
- Disable submit button and show `ClaySpinner` during async submit.
- Provide an empty state with a helpful message and action when a list is empty.

## Navigation Patterns

- Use `expo-router` file-based routes in `src/app/(tabs)/<group>/`.
- Screen titles via `<Stack.Screen options={{ title: 'Title' }} />` in the screen file or group `_layout.tsx`.
- Top-level tabs are fixed to 5 groups: `(home)`, `(automate)`, `(messages)`, `(insights)`, `(profile)`.
- Preserve state on back navigation; don't silently reset stacks.
- Support deep-linkable routes for key screens (configured in `app.json` / Expo Router linking).

## Performance Rules

- Virtualize long lists with `FlatList`.
- Reserve space for async images/content to prevent layout shift.
- Use skeleton screens (`ClaySpinner` or a custom shimmer) for loads > 300 ms.
- Keep Reanimated work on the UI thread; avoid measuring layout in every frame.
- Debounce high-frequency input events.
- Profile on low-end Android devices, not just the latest iPhone.

## Anti-Patterns Specific to This Codebase

| Don't | Do Instead |
|---|---|
| `import { View } from 'react-native'` | `import { View } from '@/tw'` |
| `import Animated from 'react-native-reanimated'` | `import Animated from '@/lib/reanimated-platform'` |
| `StyleSheet.create({ ... })` in screens | Tailwind `className` on `@/tw` primitives |
| `console.log` / `console.warn` | `addLog()` from `@/lib/logger` |
| Raw hex colors in `className` | Use `--color-*` tokens from `src/global.css` |
| Emoji icons | `SymbolIcon` from `@/components/symbol-icon` |
| Direct `tablesDB` calls in hooks | Use typed functions in `@/lib/repository.ts` |
| Direct Instagram calls outside `@/lib/instagram.ts` | Use `@/lib/instagram.ts` |
