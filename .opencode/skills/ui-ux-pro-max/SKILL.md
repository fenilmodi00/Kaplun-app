---
name: ui-ux-pro-max
description: "UI/UX design intelligence tailored for the Kaplun Expo React Native app (Expo SDK 57, React Native 0.86, Clay design system, NativeWind v5, Tailwind v4, Reanimated 4.5). Use when designing, building, or reviewing screens, components, color schemes, typography, layout, accessibility, animation, motion, interaction, or visual polish. Triggers: UI, UX, design, redesign, styling, layout, animation, motion, interaction, make it pretty, clay, screen, component, theme, color, font."
---

# UI/UX Pro Max — Kaplun Edition

Searchable UI/UX design guidance adapted for the Kaplun Instagram-creator app. This skill encodes priority-ranked rules for mobile app interfaces and maps every recommendation to the project's actual stack: Expo Router, React Native, NativeWind v5, Tailwind CSS v4, the Clay design system, React Query, and Appwrite TablesDB.

## When to Apply

Use this skill when the task involves **UI structure, visual design, interaction patterns, motion, or user-experience quality control**:

- Designing or refactoring a screen or component
- Choosing or changing colors, typography, spacing, layout, or icons
- Adding animations, transitions, press feedback, or scroll-driven motion
- Reviewing UI for accessibility, consistency, platform idioms, or perceived polish
- Building new flows (auth, onboarding, automation creation, messaging, insights)
- Fixing "the UI looks off" or "this doesn't feel native" complaints

Skip it for pure backend logic, API/database design, infrastructure, or non-visual scripts — unless the task changes how something **looks, feels, moves, or is interacted with**.

## Kaplun Stack Mapping

Before changing UI, read these files in this order:

| What you need | Read first | Why |
|---|---|---|
| Design tokens (colors, spacing, radii, shadows) | `src/global.css` | `@theme` block defines Clay tokens used by Tailwind |
| Clay primitives | `src/tw/*.tsx` | `View`, `Text`, `Pressable`, `Image`, `ScrollView`, `Animated*` wrappers |
| Clay components | `src/components/clay/*.tsx` | `ClayButton`, `ClayCard`, `ClayInput`, `ClayTabBar`, etc. |
| Screen shell / safe-area patterns | `src/components/screen-shell.tsx` | Tab-bar clearance constants and safe-area helpers |
| Icons | `src/components/symbol-icon.tsx` | Ionicons / SF Symbol wrapper |
| Animation bridge | `src/lib/reanimated-platform.ts` | Required import instead of `react-native-reanimated` |
| Navigation structure | `src/app/(tabs)/` | 5 tab groups: `(home)`, `(automate)`, `(messages)`, `(insights)`, `(profile)` |
| Fonts | `src/lib/fonts.ts` | Inter 400/500/600 loaded by `useClayFonts()` |
| Logging | `src/lib/logger.tsx` | Use `addLog()` instead of `console.log` |

### Stack-specific components you MUST prefer

- **Primitives**: import from `@/tw` (`View`, `Text`, `Pressable`, `Image`, `ScrollView`, etc.). Do not import raw `react-native` components in screens.
- **Clay components**: reuse `@/components/clay/*` before writing custom UI.
- **Icons**: use `SymbolIcon` from `@/components/symbol-icon`. Never use emoji as structural icons.
- **Animation**: import from `@/lib/reanimated-platform` or `@/tw/animated`. Never import `react-native-reanimated` directly.
- **Web variants**: any component using Reanimated must have a `.web.tsx` variant using plain RN.
- **Styling**: use Tailwind `className` on `@/tw` primitives. Do not use `StyleSheet.create()` in screens.

## Priority Rules (1 → 10)

Follow this order when making trade-offs. For the full rationale and checklists per category, read `references/quick-reference.md`. For native-app polish rules and the canonical pre-delivery checklist, read `references/pro-rules.md`.

| Priority | Category | Impact | Key Checks (must-have) | Anti-patterns (avoid) |
|---|---|---|---|---|
| 1 | Accessibility | CRITICAL | Contrast ≥ 4.5:1, `accessibilityLabel` on icon-only controls, support Dynamic Type / reduced motion | Removing focus rings, icon-only buttons without labels |
| 2 | Touch & Interaction | CRITICAL | Min 44×44 pt tap area, 8 pt spacing between targets, pressed-state feedback | Relying on hover only, instant state changes |
| 3 | Performance | HIGH | Virtualize long lists, reserve space for async content, lazy-load heavy media, keep animations on `transform`/`opacity` | Layout thrashing, animating width/height |
| 4 | Style Selection | HIGH | Match Clay/brand style, consistent icon family, no emoji, semantic tokens only | Mixing flat + skeuomorphic, raw hex in components |
| 5 | Layout & Responsive | HIGH | Mobile-first, respect safe areas, no horizontal scroll, fixed bars reserve clearance | Fixed px widths, content under tab bar |
| 6 | Typography & Color | MEDIUM | Base 16 px body, line-height 1.5, semantic color tokens mapped in `src/global.css` | Text < 12 px body, gray-on-gray, hardcoded colors |
| 7 | Animation | MEDIUM | Duration 150–300 ms, platform-native easing, reduced-motion support, spatial continuity | Decorative-only motion, animating layout properties |
| 8 | Forms & Feedback | MEDIUM | Visible labels, errors near fields, inline validation, empty states, progress feedback | Placeholder-only labels, errors only at top |
| 9 | Navigation Patterns | HIGH | Predictable back, bottom nav ≤ 5, deep-linkable routes, state preservation | Overloaded nav, broken back behavior |
| 10 | Charts & Data | LOW | Legends, tooltips, accessible colors, text summary for screen readers | Color-only meaning, missing empty states |

## Running the Search Tool

This skill bundles the same Python search engine as the original UI/UX Pro Max skill. Invoke it from the project root with its local path. It has no external dependencies beyond Python 3.

```bash
# General domain search
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain <domain> [-n <max_results>]

# Stack-specific guidance (Kaplun → react-native)
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --stack react-native

# Generate a complete design system recommendation
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system -p "Kaplun"

# Persist the design system under design-system/kaplun/
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system --persist -p "Kaplun" --output-dir "."

# Optional design dials (1–10), only with --design-system
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system --variance 5 --motion 4 --density 6 -p "Kaplun" --output-dir "."
```

If `python` is not found, try `python3` or `py -3`.

**Available domains:** `style`, `color`, `chart`, `landing`, `product`, `ux`, `typography`, `icons`, `gsap`, `react`, `web`, `nativewind`, `expo`.

**Available stacks:** `react-native`.

**For Kaplun, prefer these domains/stacks:**
- `--stack react-native` for native UI/UX implementation guidance
- `--domain nativewind` for NativeWind v5 + Tailwind v4 + `@/tw` / `useCssElement` rules (sourced from https://www.nativewind.dev/llms-full.txt and Kaplun conventions)
- `--domain expo` for Expo SDK 57, Expo Router, and common Expo APIs (sourced from https://docs.expo.dev/llms-full.txt and Kaplun conventions)
- `--domain ux` for touch, interaction, accessibility, and navigation rules
- `--domain web` for mobile web / app-interface guidelines
- `--domain product` to match the Instagram-creator product type
- `--domain style`, `--domain color` for visual system choices
- `--domain typography` for font-pairing principles only — the app uses Inter via `expo-font`/`useClayFonts()`, so ignore any Google Fonts URLs and map recommendations to the existing type scale in `src/global.css`
- `--domain gsap` for motion/animation presets (map the snippets to Reanimated in code)
- Read `references/expo-ui.md` when considering `@expo/ui` components

## Workflow

### Step 1: Analyze the Request

Extract:

- **Product context**: Which Kaplun flow? (home, automate, messages, insights, profile, auth/onboarding)
- **Audience**: Instagram creators, often on mobile, sometimes in bright/outdoor contexts
- **Style keywords**: Clay = rounded, tactile, vibrant accent cards on white canvas, dark-navy CTAs
- **Stack**: Expo SDK 57, React Native 0.86, NativeWind v5, Tailwind v4, Reanimated 4.5

### Step 2: Read Existing Design System

Always read before inventing:

1. `src/global.css` — note `@theme` tokens and Clay colors.
2. `src/tw/*.tsx` — note which primitives exist and how `useCssElement` is used.
3. `src/components/clay/*.tsx` — note available Clay components and their props.
4. `src/app/(tabs)/<relevant-group>/` — note the existing screen structure and Stack layout.

If the project already has a persisted design system at `design-system/kaplun/MASTER.md`, read it and any page override in `design-system/kaplun/pages/<page>.md`.

### Step 3: Generate a Design System via the Search Tool

For net-new screens or a redesign, run `--design-system` first. It searches product, style, color, landing, and typography in parallel and returns a complete recommendation with reasoning.

```bash
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "instagram creator saas mobile app modern minimal clay" --design-system -p "Kaplun" --output-dir "."
```

Tune the output with the optional dials:

| Dial | Low (1–3) | Mid (4–7) | High (8–10) |
|---|---|---|---|
| `--variance` | Centered / minimal | Balanced / modern | Bold / asymmetric |
| `--motion` | Subtle micro-interactions | Standard scroll/stagger | Complex choreography |
| `--density` | Spacious (24–96 pt) | Standard (16–64 pt) | Dense / dashboard (8–32 pt) |

For a page that diverges from Master, add `--page <name>`:

```bash
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "automation editor dense tool" --design-system --persist -p "Kaplun" --output-dir "." --page "automation-editor"
```

If `design-system/kaplun/MASTER.md` already exists, `--persist` skips overwriting it unless you also pass `--force`.

### Step 4: Supplement with Detailed Searches

Use `--domain` and `--stack` to deep-dive specific dimensions. For Kaplun, use `react-native` as the stack.

| Need | Command |
|---|---|
| Product type patterns | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "creator saas" --domain product` |
| Style options | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "clay minimal" --domain style` |
| Color palettes | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "creator app vibrant" --domain color` |
| Font pairings | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "modern clean" --domain typography` |
| UX best practices | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "animation accessibility" --domain ux` |
| App/native guidelines | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "touch safe-areas" --domain web` |
| Icon recommendations | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "navigation outline" --domain icons` |
| Motion presets | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "scroll reveal stagger" --domain gsap` |
| React Native stack | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "list flatlist" --stack react-native` |
| NativeWind / Tailwind styling | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "useCssElement className safe area" --domain nativewind` |
| Expo / Expo Router | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "Stack Screen dynamic route" --domain expo` |
| React performance | `python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "rerender memo" --domain react` |

When the search returns 0 results, retry once with broader keywords. If still empty, fall back to the Priority Rules table and say explicitly that the recommendation uses general defaults, not a database match.

### Step 5: Map Search Output to Kaplun Code

Translate the generic search results into the Kaplun stack using `references/kaplun-stack.md`:

- Use tokens from `src/global.css` (`bg-canvas`, `text-ink`, `bg-primary`, `text-body-md`, etc.).
- Use primitives from `@/tw` and components from `@/components/clay/*`.
- Use `SymbolIcon` for icons.
- Use `@/lib/reanimated-platform` for animation.
- Add `.web.tsx` variants for any Reanimated component.

```tsx
// Good
import { View, Text, Pressable } from '@/tw';
import { SymbolIcon } from '@/components/symbol-icon';
import Animated from '@/lib/reanimated-platform';

<View className="flex-1 bg-canvas px-md pt-safe">
  <Text className="text-ink font-display text-title-sm">Title</Text>
  <Pressable className="mt-md h-12 rounded-xl bg-primary active:opacity-80">
    <Text className="text-center text-on-primary text-button font-display">Save</Text>
  </Pressable>
</View>
```

### Step 6: Validate Before Delivery

Run through the **Pre-Delivery Checklist** in `references/pro-rules.md`. For every UI change, verify at minimum:

- [ ] No emoji used as icons; all icons from `SymbolIcon`
- [ ] All tappable elements ≥ 44×44 pt (extend `hitSlop` if visual size is smaller)
- [ ] Safe-area insets respected for top/bottom fixed bars
- [ ] Scroll content clears fixed tab bars / headers / bottom CTAs
- [ ] Pressed/disabled states visible and non-layout-shifting
- [ ] Reduced motion supported (Reanimated `ReduceMotion` or platform setting)
- [ ] Dynamic Type / largest font size does not truncate critical text or break layout
- [ ] Dark mode contrast verified independently (do not assume light-mode values carry over)
- [ ] `accessibilityLabel` on icon-only buttons; focus order matches visual order
- [ ] Animations use `transform`/`opacity` only and stay between 150–300 ms

## Stack-Specific Rules

### React Native / Expo

- Prefer `Pressable` over `TouchableOpacity` for custom press feedback.
- Use `KeyboardAvoidingView` from `@/tw` for forms that may show the keyboard.
- FlatLists with 50+ items must be virtualized; never render unbounded arrays.
- Avoid nested `ScrollView` regions that fight the main scroll.
- Respect platform navigation gestures: do not block iOS swipe-back or Android predictive back.
- Use `expo-router` `<Stack.Screen options={{ title: '...' }} />` for screen titles; keep them concise.

### NativeWind v5 + Tailwind v4

- Search `--domain nativewind` before inventing styling patterns — data lives in `data/nativewind.csv` (Kaplun + [llms-full](https://www.nativewind.dev/llms-full.txt)).
- Prefer `@/tw` primitives (`useCssElement` bridge). Do not import raw RN for `className` in screens.
- Read tokens from `src/global.css`; do not introduce ad-hoc hex values.
- Use arbitrary values sparingly (`mt-[13px]` is a smell).
- Verify class names compile on native; some Tailwind utilities are web-only — gate with `web:`.
- Platform prefixes (`ios:`, `android:`, `web:`, `native:`) are allowed, but document why.
- Put color classes on `Text`/`TextInput`, not parent `View` (RN does not cascade color).
- Always declare both sides of conditional styles (`text-ink dark:text-on-dark`).
- If Android layout balloons under `useCssElement`, fall back to raw RN + `StyleSheet` (ClayAnimatedButton pattern).

### Reanimated

- Import from `@/lib/reanimated-platform` or `@/tw/animated` only.
- Always add a `.web.tsx` variant if the component uses worklets or Reanimated hooks.
- Use `withSpring` and `withTiming` with platform-appropriate easing.
- Support reduced motion: check `ReduceMotion` or platform settings before running heavy motion.
- Never block user input during an animation.

### Clay Design System

- Background: white/off-white canvas (`bg-clay-background`).
- Primary surfaces: cards use subtle rounded corners and soft shadows (`rounded-3xl`, `shadow-sm`).
- Primary CTA: dark-navy (`bg-clay-navy`) with white text and generous radius.
- Accent cards: saturated single-color surfaces (pink, teal, lavender, peach, ochre) used sparingly as feature cards.
- Typography: Inter 400/500/600; use semantic sizes, never hardcode `< 12 px` body.

## If Results Are Unclear

Do not fabricate rules. Instead:

1. Re-read `src/global.css`, the relevant `src/tw/` primitive, and `src/components/clay/` component.
2. Re-read `references/quick-reference.md` for the relevant category.
3. If still unclear, state to the user that the recommendation is based on general mobile UX defaults, not a project-specific match, and ask for clarification.

## References

- `references/quick-reference.md` — Full priority rule index (all 10 categories)
- `references/pro-rules.md` — Native app polish rules and canonical pre-delivery checklist
- `references/kaplun-stack.md` — Detailed mapping to Clay/Expo/React Native implementation
