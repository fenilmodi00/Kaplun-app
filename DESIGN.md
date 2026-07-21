# DESIGN.md — Clay Design System in `app/`

**Project:** creator-workspace (Expo SDK 54, React Native)
**Design language:** Clay (claymation-meets-data — cream canvas, saturated single-color feature cards, dark-navy CTAs, rounded display type)
**Token source of truth:** `src/global.css` `@theme` (Tailwind v4)
**Component source:** `src/components/clay/` (8 files)

> This is the **project-specific** implementation guide. For the generic Clay design language (web marketing site, 3D illustrations, mascots), see the `Clay-design-analysis` skill. This app is **mobile-only**; many web elements (hero-band, top-nav, footer, pricing tiers) do not apply and are intentionally absent.

---

## 1. How this app implements Clay

The Clay design language is a web-marketing aesthetic. This app translates it to mobile by keeping what works on a small surface (canvas, ink type, saturated feature cards, rounded shapes, generous whitespace) and dropping what doesn't (3D claymation illustrations, hero bands, multi-column pricing, top-nav, footer-mountain). The mobile voltage comes from **saturated feature cards**, **claymation-style press animations**, and **Inter-as-display-type** at weight 500 with negative letter-spacing.

**Stack:** NativeWind v5 + Tailwind CSS v4 + `react-native-css`. Tailwind classes resolve to RN `style` props via the `useCssElement` bridge in `src/tw/`. Design tokens live as CSS variables in `src/global.css` `@theme` and surface as Tailwind utilities (`bg-canvas`, `text-ink`, `rounded-xl`, `text-display-md`, etc.).

---

## 2. Tokens (from `src/global.css`)

### Canvas & surfaces
| Token | Value | Tailwind class | Use |
|---|---|---|---|
| `--color-canvas` | `#fffaf0` | `bg-canvas` | Page floor, button-secondary fill, Android nav bar (set in `_layout.tsx:23`) |
| `--color-surface-soft` | `#faf5e8` | `bg-surface-soft` | (Reserved for footer/CTA bands — unused on mobile so far) |
| `--color-surface-card` | `#f5f0e0` | `bg-surface-card` | Cream feature card variant, testimonial-style cards |
| `--color-surface-strong` | `#ebe6d6` | `bg-surface-strong` | Emphasized bands |
| `--color-surface-dark` | `#0a1a1a` | `bg-surface-dark` | Rare dark cards |
| `--color-hairline` | `#e5e5e5` | `border-hairline` | 1px borders on cards + inputs |

### Ink & text
| Token | Value | Tailwind class | Use |
|---|---|---|---|
| `--color-primary` / `--color-ink` | `#0a0a0a` | `bg-primary`, `text-ink` | Primary CTAs, headlines, primary text |
| `--color-primary-active` | `#1f1f1f` | `bg-primary-active` | Pressed-state primary button |
| `--color-primary-disabled` | `#e5e5e5` | `bg-primary-disabled` | Disabled primary button |
| `--color-body-strong` | `#1a1a1a` | `text-body-strong` | Lead paragraphs |
| `--color-body` | `#3a3a3a` | `text-body` | Default running text |
| `--color-muted` | `#6a6a6a` | `text-muted` | Sub-headings, breadcrumbs, secondary labels |
| `--color-muted-soft` | `#9a9a9a` | `text-muted-soft` | Captions, fine-print |
| `--color-on-primary` / `--color-on-dark` | `#ffffff` | `text-on-primary`, `text-on-dark` | Text on primary buttons + dark feature cards (teal) |

### Brand feature-card palette (the 6-color set)
| Token | Value | Tailwind class | Card text color |
|---|---|---|---|
| `--color-brand-pink` | `#ff4d8b` | `bg-brand-pink` | `text-on-dark` (white) |
| `--color-brand-teal` | `#1a3a3a` | `bg-brand-teal` | `text-on-dark` (white) |
| `--color-brand-lavender` | `#b8a4ed` | `bg-brand-lavender` | `text-ink` (dark — enough contrast) |
| `--color-brand-peach` | `#ffb084` | `bg-brand-peach` | `text-ink` |
| `--color-brand-ochre` | `#e8b94a` | `bg-brand-ochre` | `text-ink` |
| `--color-brand-mint` | `#a4d4c5` | `bg-brand-mint` | Illustration accent, small badges |
| `--color-brand-coral` | `#ff6b5a` | `bg-brand-coral` | Highlights |

> The saturated 6-card set is pink, teal, lavender, peach, ochre, cream-card (`bg-surface-card`). Mint and coral are accent-only — never full-card surfaces.

### Semantic
| Token | Value | Tailwind class |
|---|---|---|
| `--color-success` | `#22c55e` | `bg-success`, `text-success` |
| `--color-warning` | `#f59e0b` | `bg-warning`, `text-warning` |
| `--color-error` | `#ef4444` | `bg-error`, `text-error` |

### Radius (Clay scale — overrides Tailwind defaults)
| Token | Value | Tailwind class | Use |
|---|---|---|---|
| `--radius-xs` | `6px` | `rounded-xs` | Small badges |
| `--radius-sm` | `8px` | `rounded-sm` | Small buttons |
| `--radius-md` | `12px` | `rounded-md` | **CTA buttons, text inputs** |
| `--radius-lg` | `16px` | `rounded-lg` | Content cards, `clayCard` compound |
| `--radius-xl` | `24px` | `rounded-xl` | **Feature cards** (saturated brand-color cards), `clayFeatureCardBase` |
| `--radius-pill` | `9999px` | `rounded-pill` | Category tabs, badge pills |

### Typography (Inter loaded via `useClayFonts()`)
The mobile substitute for **Plain Black** is **Inter at weight 500** with the negative letter-spacing encoded in the typography tokens below. Inter 400 = body, Inter 500 = display substitute, Inter 600 = titles + buttons.

| Tailwind class | Size | Weight | LH | LS | Use |
|---|---|---|---|---|---|
| `text-display-xl` | 72px | 500 | 72px | -2.5px | (Web only — too large for mobile) |
| `text-display-lg` | 56px | 500 | 59px | -2px | (Web only) |
| `text-display-md` | 40px | 500 | 44px | -1px | Large screen headings |
| `text-display-sm` | 32px | 500 | 37px | -0.5px | Screen + feature-card titles |
| `text-title-lg` | 24px | 600 | 31px | -0.3px | Larger feature titles |
| `text-title-md` | 18px | 600 | 25px | 0 | Card titles |
| `text-title-sm` | 16px | 600 | 22px | 0 | Small card titles, list labels |
| `text-body-md` | 16px | 400 | 25px | 0 | Default running text |
| `text-body-sm` | 14px | 400 | 22px | 0 | Fine-print |
| `text-caption` | 13px | 500 | 18px | 0 | Badge labels, captions |
| `text-caption-uppercase` | 12px | 600 | 17px | 1.5px | Section labels — pair with `uppercase` |
| `text-button` | 14px | 600 | 14px | 0 | Button labels |
| `text-nav-link` | 14px | 500 | 20px | 0 | Tab bar labels |

Font family is set via `--font-sans` (Inter_400Regular) and `--font-display` (Inter_500Medium) with platform fallbacks in the `@media ios` / `@media android` blocks at the bottom of `global.css`. Use `font-sans` for body, `font-display` for headlines.

---

## 3. Compound utilities (`src/tw/cn.ts`)

Pre-built class strings — use these instead of re-typing:

```ts
import { cn, clayInput, clayCard, clayFeatureCardBase, clayButtonBase } from '@/tw/cn';

clayInput           // 'h-11 py-3 bg-canvas border border-hairline rounded-md px-4 text-body-md text-ink'
clayCard            // 'bg-canvas border border-hairline rounded-lg p-6'
clayFeatureCardBase // 'rounded-xl p-8 gap-3'
clayButtonBase      // 'h-11 py-3 rounded-md px-5 flex-row items-center justify-center gap-2'
```

`cn(...inputs)` is `twMerge(clsx(inputs))` — merge conditional classes, Tailwind conflicts resolved.

---

## 4. Component inventory (`src/components/clay/`)

| Component | File | Surface | Use |
|---|---|---|---|
| `ClayTabBar` | `ClayTabBar.tsx` | `@/tw` (View, Text) + Reanimated | Custom bottom tab bar (Home / Messages / Profile) with sliding spring indicator |
| `ClayAnimatedButton` | `ClayAnimatedButton.tsx` (+ `.web.tsx`) | raw RN + Reanimated | 4 variants: `primary` / `secondary` / `on-color` / `text-link`. Press scale-down animation. Loading + disabled states. **Why raw RN?** Avoids NativeWind `useCssElement` Android layout bugs (see comment in file) |
| `ClayAnimatedCard` | `ClayAnimatedCard.tsx` | `@/tw` (View, Pressable) + Reanimated | Pressable card with entrance fade-in + press scale-down. Conditionally wraps in `Pressable` only when `onPress` provided |
| `ClayFeatureCard` | `ClayFeatureCard.tsx` | `@/tw` (View, Text) + Reanimated | Saturated single-color card. `color` prop: `'pink' \| 'teal' \| 'lavender' \| 'peach' \| 'ochre' \| 'cream'`. Entrance animation |
| `ClayAvatar` | `ClayAvatar.tsx` | `@/tw/image` | Circular avatar with placeholder fallback |
| `ClaySpinner` | `ClaySpinner.tsx` (+ `.web.tsx`) | raw RN + Reanimated | Loading spinner with optional label. Web variant uses `ActivityIndicator` |

> **Not built (intentionally):** `hero-band`, `hero-illustration-card`, `top-nav`, `pricing-tier-card`, `cta-band-illustrated`, `footer`, `testimonial-card`, `expert-card`, `category-tab`. These are web-marketing components — mobile uses `ClayTabBar` for navigation, no hero band, no footer. Add them only if a screen actually needs them.

---

## 5. Animations (`src/hooks/useClayAnimations.ts`)

All Reanimated logic is centralized here. Import from `@/hooks/useClayAnimations` (NOT `react-native-reanimated` directly):

| Hook | Returns | Use |
|---|---|---|
| `usePressAnimation(scaleDown = 0.97)` | `{ onPressIn, onPressOut, animatedStyle }` | Buttons + pressable cards. Bind handlers + `Animated.View style={animatedStyle}` |
| `useShakeAnimation()` | `{ shake, animatedStyle }` | Error feedback. Call `shake()` to trigger |
| `useEntranceAnimation(delay = 0)` | `{ animatedStyle }` | Card/section fade-in + slide-up on mount |

Pattern:
```tsx
const { onPressIn, onPressOut, animatedStyle } = usePressAnimation();
<AnimatedView onPressIn={onPressIn} onPressOut={onPressOut} style={animatedStyle} />
```

> `AnimatedView` comes from `@/tw/animated` — platform-specific (Reanimated on native, plain `View` on web for #8285 safety).

---

## 6. The `@/tw` vs raw-RN split

The most important convention. Two parallel paths for building Clay components:

| Path | When to use | Pros | Cons |
|---|---|---|---|
| **`@/tw` primitives** (`View`, `Text`, `Pressable` from `@/tw`) | Default. Use Tailwind `className` for styling | Theme tokens resolve automatically; theme-wide changes one place | `useCssElement` can cause layout bugs on Android (rare but real) |
| **Raw RN** (`View`, `Text` from `react-native` + `StyleSheet.create`) | When Android layout bugs appear in `@/tw`-based components, or for animation-heavy components where `useCssElement` interferes | Predictable StyleSheet behavior; no NativeWind runtime overhead | Must hardcode hex values (duplicated from `global.css`); theme changes require manual updates |

**Current raw-RN components:** `ClaySpinner`, `ClayAnimatedButton`, `AuthScreen`. Each has an inline comment explaining the choice. If you add a new component and hit Android layout issues, switch to raw RN — but add a comment explaining why, and duplicate the hex values from `global.css` with a `// from --color-X` reference.

---

## 7. The `.web.tsx` strategy

Any component using Reanimated animations gets a `.web.tsx` variant. Metro resolves `.web.tsx` on web platform. The web variant:
- Does NOT import `react-native-reanimated`
- Uses plain RN (`ActivityIndicator`, plain `View`) instead
- Has the same prop signature so callers don't branch

Current `.web.tsx` variants: `ClaySpinner.web.tsx`, `ClayAnimatedButton.web.tsx`, `src/tw/animated.web.tsx`.

In addition, `metro.config.js` aliases `react-native-reanimated` and `react-native-worklets` to no-op stubs on web (issue #8285 — Reanimated crashes on web). The stubs live in `src/lib/reanimated-web-stub.js` and `src/lib/worklets-web-stub.js`. Belt-and-suspenders: both Metro aliasing AND `@/lib/reanimated-platform.ts` (Platform conditional).

---

## 8. Adding a new screen — design decision tree

1. **Background:** `bg-canvas` on the root `View`. Always. The cream tint is non-negotiable.
2. **Headlines:** `font-display text-display-sm` (32px) or `text-display-md` (40px) for the screen title. Never bigger on mobile — `display-lg`/`display-xl` are web-only.
3. **Body:** `font-sans text-body-md text-body`. Use `text-muted` for secondary, `text-muted-soft` for fine-print.
4. **Cards (content/data):** `ClayAnimatedCard` (pressable) or `clayCard` compound class on a `View` (static). `bg-canvas border-hairline rounded-lg p-6`.
5. **Feature cards (highlight):** `ClayFeatureCard` with `color="pink|teal|lavender|peach|ochre|cream"`. **Cycle colors** — don't repeat the same color twice in a row. Pink = outbound/sequencer, teal = featured/enterprise, lavender = AI-agent, peach = general warmth, ochre = community/deals.
6. **Buttons:** `ClayAnimatedButton` with `variant="primary|secondary|on-color|text-link"`. Primary = `bg-primary text-on-primary` (dark navy + white). `on-color` = white button on saturated feature cards.
7. **Inputs:** `clayInput` compound class on a `TextInput` from `@/tw`. `bg-canvas border-hairline rounded-md h-11`.
8. **Loading:** `ClaySpinner` with optional `label`.
9. **Lists:** `FlatList` (raw RN — no `@/tw` equivalent). Wrap items in `ClayAnimatedCard`.
10. **Animations:** import from `@/hooks/useClayAnimations`. NEVER from `react-native-reanimated` directly.

---

## 9. Do's and Don'ts (mobile-adapted)

### Do
- Anchor every screen on `bg-canvas` (`#fffaf0`). Set the Android nav bar to match (already done in `_layout.tsx:33-37`).
- Cycle saturated feature cards: pink → teal → lavender → peach → ochre → cream. Never the same color twice in a row.
- Use Inter 500 (`font-display`) with the token's negative letter-spacing for headlines. The rounded character + 500 weight is the brand voice.
- Show real product UI fragments inside feature cards (stats, thread previews, deal terms) — not abstract illustrations.
- Use `ClayAnimatedButton` for all CTAs — the press animation IS the claymation feel.
- Use generous padding on cards (`p-6` content, `p-8` feature) — whitespace is part of the system.
- Use `ClayTabBar` for navigation — never the default expo-router tab bar.
- Wrap pressable cards in `ClayAnimatedCard` — the entrance + press animation is the mobile claymation equivalent.

### Don't
- Don't use cool grays for the canvas. `#fffaf0` cream is non-negotiable.
- Don't introduce a 7th brand-color card. The 6-color palette (pink/teal/lavender/peach/ochre/cream) is saturated enough.
- Don't bold display type beyond 500. Inter at 700 reads as bombastic; 500 + negative LS is the substitute for Plain Black.
- Don't use `react-native-reanimated` directly — use `@/lib/reanimated-platform` or `@/hooks/useClayAnimations`.
- Don't mix `@/tw` and raw `react-native` imports in the same component — pick one path (see §6).
- Don't add hover states. Mobile has no hover. The system encodes press states via Reanimated.
- Don't use `StyleSheet.create()` in screens — use Tailwind `className` via `@/tw`. Raw RN + StyleSheet is for `@/tw/*` wrappers and the few documented Android-layout-bug-avoidance components.
- Don't import `Image` from `react-native` or `expo-image` — use `@/tw/image`.
- Don't add a dark footer / dark band. The cream-throughout palette is a system contract.

---

## 10. Known gaps & debt

- **No 3D claymation illustrations on mobile.** The web brand voltage comes from 3D-rendered mountains/mascots. Mobile has no equivalent — the voltage comes from saturated cards + press animations instead. If we ever add illustrations, they'll be commissioned Lottie/PNG assets, not tokens.
- **Duplicated hex values.** `ClayAnimatedButton.tsx:17-19`, `ClaySpinner.tsx:13-14`, `AuthScreen.tsx:52-57` hardcode `#fffaf0`, `#0a0a0a`, `#e5e5e5`, `#6a6a6a` instead of referencing `global.css` tokens. Centralize when a safe path exists (raw-RN components can't read CSS vars at runtime).
- **Direct `react-native-reanimated` imports in 10 files.** All 6 animated Clay components + 3 screens + `@/tw/animated.tsx` import Reanimated directly instead of `@/lib/reanimated-platform`. Migrate.
- **No form-validation states.** `clayInput` has no `error` / `success` variant class. AuthScreen handles this with inline styles. Add `clayInputError`, `clayInputSuccess` compounds when needed.
- **No dark mode.** Clay is a warm-light-only system. Dark mode would require a parallel token set — not planned.
- **`AUTH_PLAN.md` planned an `(auth)` route group** — never built. Auth is an inline `AuthScreen` component rendered by `AuthGate` in `_layout.tsx`. The 814-LOC `AuthScreen.tsx` has 5 inline sub-components (`CapsuleToggle`, `EmailField`, `PasswordInput`, `OTPInput`, `AuthShell`) that could be extracted.
- **No empty-state / error-state Clay components.** Each screen hand-rolls its loading/error/empty UI with `ClaySpinner` + inline text. Consider `ClayEmptyState`, `ClayErrorState` components if patterns repeat.

---

## 11. References

- **Generic Clay design language** — `Clay-design-analysis` skill (web marketing site, full component library, 3D illustration guidance)
- **Token source** — `src/global.css` `@theme` block
- **Component source** — `src/components/clay/` (see `src/components/clay/AGENTS.md` for the per-component prop reference)
- **Styling primitives** — `src/tw/` (see `src/tw/AGENTS.md`)
- **Animation hooks** — `src/hooks/useClayAnimations.ts`
- **Font loading** — `src/lib/fonts.ts` (`useClayFonts`, `CLAY_FONTS` — Inter 400/500/600)
- **Web safety** — `src/lib/reanimated-platform.ts`, `src/lib/reanimated-web-stub.js`, `src/lib/worklets-web-stub.js`, `metro.config.js`
