# DESIGN.md — Clay & Kaplun Design System & Mobile App Engineering Manual

**Project:** creator-workspace (`Kaplun-app` — Expo SDK 54, React Native & Kaplun Web Ecosystem)  
**Design Language:** Clay (claymation-meets-data & creator-growth — cream canvas `#fffaf0`, saturated single-color feature cards, dark-navy CTAs, rounded display typography, warm-light aesthetic)  
**Web & Live Spec Origin:** [Clay.com](https://www.clay.com/), [Kaplun Tech](http://kaplun.tech/), and [DESIGN copy.md](file:///d:/Kaplun-app/DESIGN%20copy.md)  
**Token Source of Truth:** `src/global.css` `@theme` (Tailwind v4)  
**Component Source:** `src/components/clay/` (8 mobile components + web variants)  
**Styling Primitives:** `src/tw/` (`useCssElement` bridge via `react-native-css`)  

---

## 0. Runtime Verification & Live Brand Specifications

*Extracted live from Clay.com and Kaplun.tech via Playwright runtime snapshots, computed DOM state, and asset manifests (2026-07-22/23).*

### 0.1 Verified Typography (Live Site & Mobile Substitutes)
- **Primary Display Font (Web):** `Roobertvf` (variable display face), or Google Fonts **Nunito 700** for display headlines (warmth, rounded terminals, matching negative tracking).
- **Body & UI Font:** **Inter** (400 Regular, 500 Medium, 600 SemiBold).
- **Mobile Substitute Stack:** **Inter 500** (`font-display` / `Inter_500Medium`) with negative letter-spacing for headlines, and **Inter 400** (`font-sans` / `Inter_400Regular`) for body & running text.
- **h1 (Hero headline):** 88px / weight 575–700 / line-height 1.0 / letter-spacing -3.52px / color `rgb(254,253,251)` (near-white on dark green hero `#035D44`). Mobile screen heading equivalent: `display-md` (40px) or `display-sm` (32px) with -1px / -0.5px tracking.
- **h2 (Section headline):** 72px / 500 / -2.16px / `#0a0a0a`. Secondary h2 (CTA band): 44px / 500 / -0.88px / line-height 1.1.
- **h3 (Band titles):** 48px / 500 / -1.92px / line-height 1.0. Color is **tinted per band**:
  - `#001433` (navy on blue band)
  - `#381005` (brown on orange band)
  - `#053219` (dark green on green band)
  - `#3c0a1e` (maroon on pink band)
- **Buttons (Verified):** Font 13.92px (~14px) / weight 500–600 / letter-spacing -0.14px / radius 12–14px / height 38.5px–44px / border 0.8px / padding 8px–10px px-4–px-5.
  - **Primary Button:** `#0a0a0a` bg (near-black ink), white text (`#ffffff`).
  - **Secondary Button:** `#f3f2ed` cream bg, `#0a0a0a` text (hover `#eae8df`).

### 0.2 Verified Hero Structure
- **Full-bleed dark green hero band:** `#035D44` (`rgb(3,93,68)`).
- **Video Scene:** Top claymation animation/video (`/media/homemain.mp4` / `hero-contraption.webm`).
- **Headline (H1):** "Build systems to grow with creators" (`rgb(254,253,251)` near-white, 88px / negative tracking).
- **Sub-paragraph & Dual CTAs:** White sub-paragraph ("Infrastructure to source micro-influencers, launch seeding programs, and scale creator-led growth.") + Primary black pill CTA (`#0a0a0a`, rounded-12) + Secondary cream CTA (`#f3f2ed`).
- **Pill badge link:** "NEW: AI CREATOR MATCHING" above H1 (`bg-white/10 text-white backdrop-blur-sm border border-white/10`).
- **Top Nav Bar:** Fixed position top (`fixed top-0 left-0 right-0 z-50`), ~85%–95% container width (`w-[94%] sm:w-[95%] md:w-[96%] max-w-[1600px] mx-auto`), rounded bottom corners (`rounded-b-2xl` / 24px), ~64px height, white/cream backdrop (`bg-white/98 backdrop-blur-md border-x border-[rgba(209,205,199,0.6)]`).

### 0.3 Verified Section Architecture & Kaplun Copy Deck
1. **Nav** — Logo left ("Kaplun"); Services, How It Works, Results, Pricing center; ⌘K, Log in, Get a demo, Start free trial right.
2. **Hero** — Dark green `#035D44`, video scene (`/media/homemain.mp4`), H1 + sub + dual CTAs ("Join the waitlist" / "Get a demo").
3. **Results / Social Proof** — Cream band: "Trusted by 120+ DTC brands and consumer startups. Inspired by our customers. Built with love." + infinite marquee scroll of stat/quote cards:
   - `+184%` creator-sourced revenue
   - `24h` creator shortlists
   - `"Kaplun cut our creator discovery from 3 weeks to 2 days."` — Nūrio
   - `3.2x` avg. ROAS on creator ads
   - `85%` creator response rate
   - `"We seeded 1,200 creators in one quarter with a team of two."` — Bloom & Co.
   - `500+` campaigns shipped
   - `40M+` creator-driven impressions
   - `"We scaled creator ads to 3.8x ROAS in under 60 days."` — Velvet Skincare
4. **Interactive Tab Section (7 Tabs)** — h2 "Build systems to grow with creators" (72px black on white), sub "Find every creator in your TAM in one place.", 7 pill tabs (Creator Sourcing, Product Seeding, Affiliates, UGC Content, Creator Ads, Whitelisting, Analytics), dynamic product-UI preview card.
5. **AI Prompt Widget** — h3 "What creators do you want to source?" (48px) on cream canvas, large input card with placeholder prompt, preset pills ("Find skincare creators", "Find fitness creators", "Find food creators"), black submit button.
6. **4 Tinted Feature Bands** — Full-width rounded bands with small-caps label chip, tinted 48px h3, paragraph, proof strip, hue-matched CTA button, and 3D claymation visual:
   - **DISCOVERY (Blue):** BG `#eaf2fb`, text `#001433`, button `#1a6dff` ("Source creators from the most complete influencer graph" — `magnifier.webm` — stat: "Nūrio cut creator discovery from 3 weeks to 2 days.").
   - **SEEDING (Orange):** BG `#fdf0e4`, text `#381005`, button `#c45c0c` ("Run seeding programs that ship themselves" — stat: "Bloom & Co. seeded 1,200 creators in one quarter with a team of two.").
   - **CAMPAIGNS (Green):** BG `#e6f4ea`, text `#053219`, button `#0d7a3b` ("Orchestrate every campaign in one place" — stat: "Halcyon runs 40+ live campaigns without a single spreadsheet.").
   - **AMPLIFICATION (Pink):** BG `#fce8f0`, text `#3c0a1e`, button `#c21e6b` ("Turn winning posts into paid growth" — stat: "Velvet Skincare scaled creator ads to 3.8x ROAS.").
7. **Infrastructure Band** — Label "CREATOR INFRASTRUCTURE", h3 "Build systems that make your team more productive", chat-UI mock (Prompt: "Which skincare micro-creators have >8% engagement this month?") + Terrapin stat card ("Terrapin generates +32% more revenue per marketer with Kaplun.").
8. **Case Studies Grid** — h3 "Hear from the brands that grow with Kaplun" (3 cards: Nūrio +212% creator revenue, video player card w/ `shapes-tower.webm` loop, Halcyon 40+ campaigns).
9. **Resources Grid** — h3 "Learn more about creator-led growth" (6 mixed cards: Creator Playbook guide, 2026 Creator Pricing Report, Livestream "How Kaplun uses Kaplun", Community story, Careers "Come and join us", Kaplun Academy).
10. **Closing CTA Band** — "Turn your creator ideas into revenue today" (44px) + "Book your demo today. No commitment required." + dual CTAs on white/cream.
11. **Footer** — Warm cream `#faf5e8` / `#faf6ee` (NEVER dark navy), 7 link columns (Services, Platform, Playbooks, Resources, Company, Customers, Legal), big logo bottom-left, "Born remote" + "©2026 Kaplun Tech.", socials LinkedIn/YouTube/X.

### 0.4 Verified Media Assets

| File | Spec | Content | Usage |
|---|---|---|---|
| `homemain.mp4` / `hero-contraption.webm` | 3000×1500, 17s | Claymation contraption on green hills under blue sky | **Hero Video** (autoplay muted loop playsinline) |
| `magnifier.webm` | 1000×1000, 8s | Blue magnifying-glass contraption with red ball on cream | **Discovery (Blue) Band** visual |
| `shapes-tower.webm` | 1920×1080, 6s | Colorful clay shapes balancing on pedestal, characters on ladders | **Case Study Video Card** preview loop |

---

## 1. Core Design Philosophy & Overview

Clay/Kaplun is a warm, playful, state-of-the-art SaaS interface. The base atmosphere is a **cream-tinted white canvas** (`--color-canvas` — `#fffaf0`) holding dark-navy ink typography (`#0a0a0a`) and **3D-rendered claymation artwork** as brand voltage.

Where most data-platform brands play it cool with gray grids and generic gradients, Clay & Kaplun lean hard into:
- **Warm Cream Floor:** `#fffaf0` canvas sets a distinct, welcoming visual identity.
- **Dark Navy Ink CTAs:** Near-black (`#0a0a0a`) primary CTAs with rounded corners (`rounded-md` 12–14px).
- **Saturated 6-Color Feature Palette:** Pink (`#ff4d8b`), Teal (`#1a3a3a`), Lavender (`#b8a4ed`), Peach (`#ffb084`), Ochre (`#e8b94a`), and Cream Card (`#f5f0e0` / `#ffffff`).
- **Rounded Display Type:** Nunito 700 (Web display) or Inter 500 (Mobile display substitute) with negative letter-spacing for headlines.
- **Generous Border Radii:** 12–14px for buttons/inputs (`rounded-md`), 16–20px for cards (`rounded-lg`), 24–28px for feature bands (`rounded-xl`), 32–36px for hero containers (`rounded-2xl`).
- **Warmth Throughout:** Cream footers and closing CTA bands — never dark footers.

---

## 2. Complete Design Tokens

All design tokens are defined in `src/global.css` under the `@theme` block (Tailwind v4) and accessible via CSS custom variables.

### 2.1 Brand, Canvas & Surface Tokens

| Token Variable | Hex / Value | Tailwind Utility Class | Description / Use |
|---|---|---|---|
| `--color-canvas` | `#fffaf0` | `bg-canvas` | Primary page floor / background canvas, secondary button hover |
| `--color-canvas-alt` | `#f9f8f5` | `bg-canvas-alt` | Alternate section canvas for rhythm shifts |
| `--color-primary` / `--color-ink` | `#0a0a0a` | `bg-primary`, `text-ink` | Primary CTAs, display headlines, primary body ink |
| `--color-primary-active` | `#1f1f1f` | `bg-primary-active` | Pressed primary button state |
| `--color-primary-disabled` | `#e5e5e5` | `bg-primary-disabled` | Disabled CTA state |
| `--color-button-secondary` | `#f3f2ed` | `bg-button-secondary` | Secondary button background |
| `--color-button-secondary-hover` | `#eae8df` | - | Secondary button hover background |
| `--color-surface-soft` | `#faf5e8` | `bg-surface-soft` | Footer, CTA band soft fill |
| `--color-surface-card` | `#f5f0e0` / `#ffffff` | `bg-surface-card` | True white card surface on cream canvas / cream feature card variant |
| `--color-surface-strong` | `#ebe6d6` | `bg-surface-strong` | Emphasized content bands |
| `--color-surface-dark` | `#035d44` | `bg-surface-dark` | Hero dark green surface |
| `--color-surface-dark-elevated` | `#1a2a2a` | `bg-surface-dark-elevated` | Dark modal / overlay surface |
| `--color-on-primary` / `--color-on-dark` | `#ffffff` | `text-on-primary`, `text-on-dark` | Text on primary buttons and dark feature cards |

### 2.2 Borders & Lines

| Token Variable | Hex / Value | Tailwind Utility Class | Use |
|---|---|---|---|
| `--color-hairline` | `#e5e5e5` | `border-hairline` | 1px standard warm sand border on cards & inputs |
| `--color-border-subtle` | `rgba(209, 205, 199, 0.45)` | `border-border-subtle` | Soft separators, floating nav bar outline |
| `--color-border-strong` | `rgba(10, 10, 10, 0.12)` | `border-border-strong` | Emphasized container borders |

### 2.3 Text Hierarchy Palette

| Token Variable | Hex | Tailwind Class | Description |
|---|---|---|---|
| `--color-ink` | `#0a0a0a` | `text-ink` | Headlines, primary titles, primary buttons |
| `--color-body-strong` | `#1a1a1a` | `text-body-strong` | Lead paragraphs, card titles |
| `--color-body` | `#3a3a3a` | `text-body` | Running body text |
| `--color-muted` | `#6a6a6a` | `text-muted` | Sub-headings, secondary text, footer links |
| `--color-muted-soft` | `#9a9a9a` | `text-muted-soft` | Captions, fine-print |

### 2.4 Saturated Feature Card Palette (6-Card Set)

| Card Variant | Background Token | Value | Text Color Class | Usage / Theme |
|---|---|---|---|---|
| **Pink Card** | `--color-brand-pink` | `#ff4d8b` | `text-on-dark` (`#ffffff`) | Outbound, campaigns, viral growth |
| **Teal Card** | `--color-brand-teal` | `#1a3a3a` | `text-on-dark` (`#ffffff`) | Enterprise, featured features, infrastructure |
| **Lavender Card** | `--color-brand-lavender` | `#b8a4ed` | `text-ink` (`#0a0a0a`) | AI matching, creator agents, intelligence |
| **Peach Card** | `--color-brand-peach` | `#ffb084` | `text-ink` (`#0a0a0a`) | Seeding programs, creator warmth |
| **Ochre Card** | `--color-brand-ochre` | `#e8b94a` | `text-ink` (`#0a0a0a`) | Community, deals, monetization |
| **Cream Card** | `--color-surface-card` | `#f5f0e0` / `#ffffff` | `text-ink` (`#0a0a0a`) | General features, testimonials |

*Accent tokens:* `--color-brand-mint` (`#a4d4c5`) and `--color-brand-coral` (`#ff6b5a`) are reserved for small badges and highlights — never full card backgrounds.

### 2.5 Category Badge Tokens

| Category | Background Token | Value | Text Token | Value |
|---|---|---|---|---|
| **Data / Discovery** | `--color-badge-data-bg` | `#eff6ff` (blue) | `--color-badge-data-text` | `#2563eb` |
| **Agents / Matching** | `--color-badge-agents-bg` | `#fff7ed` (orange) | `--color-badge-agents-text` | `#d97706` |
| **Orchestration** | `--color-badge-orchestration-bg` | `#f7fee7` (green) | `--color-badge-orchestration-text` | `#65a30d` |
| **Execution** | `--color-badge-execution-bg` | `#fdf2f8` (pink) | `--color-badge-execution-text` | `#db2777` |

### 2.6 Band Tint Tokens

| Feature Band | Background Token | Value | Text Color | Button Fill Token | Value |
|---|---|---|---|---|---|
| **Discovery (Blue)** | `--color-band-blue-bg` | `#eaf2fb` | `#001433` | `--color-band-blue-btn` | `#1a6dff` |
| **Seeding (Orange)** | `--color-band-orange-bg` | `#fdf0e4` | `#381005` | `--color-band-orange-btn` | `#c45c0c` |
| **Campaigns (Green)** | `--color-band-green-bg` | `#e6f4ea` | `#053219` | `--color-band-green-btn` | `#0d7a3b` |
| **Amplification (Pink)** | `--color-band-pink-bg` | `#fce8f0` | `#3c0a1e` | `--color-band-pink-btn` | `#c21e6b` |

### 2.7 Gradient Accents

- `--clay-gradient-data`: `linear-gradient(135deg, #2563eb, #3b82f6)`
- `--clay-gradient-agents`: `linear-gradient(135deg, #d97706, #f59e0b)`
- `--clay-gradient-orchestration`: `linear-gradient(135deg, #65a30d, #84cc16)`
- `--clay-gradient-execution`: `linear-gradient(135deg, #db2777, #f43f5e)`
- `--clay-gradient-hero`: `linear-gradient(180deg, #0b4c37, #083c2c)`

### 2.8 Semantic Colors

- **Success:** `--color-success` (`#22c55e`)
- **Warning:** `--color-warning` (`#f59e0b`)
- **Error:** `--color-error` (`#ef4444`)

---

## 3. Typography System ("Ponds" & Fonts)

### 3.1 Font Stacks
- **Web Display:** `Roobertvf` / **Nunito 700** (Google Fonts) for display headlines. Warmth with rounded terminals.
- **Web Body / UI:** **Inter** (400 Regular, 500 Medium, 600 SemiBold).
- **Mobile Stack (React Native):**
  - `--font-display`: `Inter_500Medium` (Loaded via `useClayFonts()`).
  - `--font-sans`: `Inter_400Regular`.
  - Display headlines use `font-display` with negative letter-spacing tokens.

### 3.2 Typography Scale

| Token Class | Size | Weight | Line Height | Letter Spacing | Application |
|---|---|---|---|---|---|
| `text-display-xl` | 72–88px | 500–700 | 1.0 (72–88px) | -2.5px to -3.52px | Homepage Hero H1 |
| `text-display-lg` | 56–72px | 500 | 1.05 (59–72px) | -2px to -2.8px | Section Headings |
| `text-display-md` | 40px | 500 | 44px | -1px | Sub-section Heads, Mobile Screen Titles |
| `text-display-sm` | 32px | 500 | 37px | -0.5px | Screen & Feature Card Titles |
| `text-title-lg` | 24px | 600 | 31px | -0.3px | Plan Names, Major Card Headings |
| `text-title-md` | 18px | 600 | 25px | 0 | Standard Card Titles |
| `text-title-sm` | 16px | 600 | 22px | 0 | Small Card Titles, List Item Labels |
| `text-body-lg` | 18px | 400 | 28px | 0 | Lead Paragraphs, Intro Copy |
| `text-body-md` | 16px | 400 | 25px | 0 | Default Running Body Text |
| `text-body-sm` | 14px | 400 | 22px | 0 | Footer Text, Fine-print |
| `text-caption` | 13px | 500 | 18px | 0 | Captions, Badges |
| `text-caption-uppercase` | 12px | 600 | 17px | 1.5px | Section Labels (pair with `uppercase`) |
| `text-button` | 13.92px (~14px) | 500–600 | 14px | -0.14px | CTA Button Labels |
| `text-nav-link` | 14px | 500 | 20px | 0 | Navigation Links & Tab Labels |

---

## 4. Spacing & Radius Scales

### 4.1 Spacing Scale (4px Base Unit)

| Token | Value | Utility Class | Use Case |
|---|---|---|---|
| `--spacing-xxs` | 4px | `p-1`, `gap-1` | Tight inline gaps, badge padding |
| `--spacing-xs` | 8px | `p-2`, `gap-2` | Button internal vertical padding, icon gap |
| `--spacing-sm` | 12px | `p-3`, `gap-3` | Input padding, small card gap |
| `--spacing-md` | 16px | `p-4`, `gap-4` | Standard card internal padding, list spacing |
| `--spacing-lg` | 24px | `p-6`, `gap-6` | Large card padding, modal content padding |
| `--spacing-xl` | 32px | `p-8`, `gap-8` | Saturated feature card padding, section gap |
| `--spacing-xxl` | 48px | `p-12`, `gap-12` | Major container spacing |
| `--spacing-section` | 96px | `py-24` | Vertical rhythm between major web editorial bands |

### 4.2 Border Radius Scale (Clay Rounded Scale)

| Token Variable | Value | Tailwind Class | Application |
|---|---|---|---|
| `--radius-xs` | 6px | `rounded-xs` | Small badges, dropdown menu items |
| `--radius-sm` | 8–10px | `rounded-sm` | Small secondary buttons, hairline tags |
| `--radius-md` | 12–14px | `rounded-md` | **Standard CTA Buttons, Text Inputs, Modals** |
| `--radius-lg` | 16–20px | `rounded-lg` | Content Cards, Testimonials, Pricing Tiers, `clayCard` |
| `--radius-xl` | 24–28px | `rounded-xl` | **Feature Cards (Saturated Bands)**, `clayFeatureCardBase` |
| `--radius-2xl` | 32–36px | `rounded-2xl` | Hero Sections, Nav Bar bottom corners |
| `--radius-pill` | 9999px | `rounded-pill` / `rounded-full` | Pills, Category Tabs, Avatars |

---

## 5. Component Specifications & Design Tokens

### 5.1 Buttons & Button Variants

```ts
// Clay Primary Button Spec
height: 38.5px - 44px (h-11 on mobile)
padding: px-4 py-2.5 to px-5 py-3
background: var(--color-primary) (#0a0a0a)
text-color: var(--color-on-primary) (#ffffff)
font: 13.92px / 500-600 / ls -0.14px
radius: rounded-md (12-14px)
border: none (or 0.8px border-transparent)
active-state: scale down (0.97) + bg-[#1f1f1f]

// Clay Secondary Button Spec
background: #f3f2ed (var(--color-button-secondary))
text-color: #0a0a0a (var(--color-ink))
hover/active-bg: #eae8df
radius: rounded-md (12-14px)

// On-Color Button Spec (Used inside tinted feature bands)
background: #ffffff
text-color: #0a0a0a (or band text hue)
radius: rounded-md (12-14px)

// Text-Link Button Spec
background: transparent
text-color: #0a0a0a
underline on hover / active
```

### 5.2 Form Inputs

`clayInput` compound utility: `h-11 py-3 bg-canvas border border-hairline rounded-md px-4 text-body-md text-ink`.  
Focused state: border thickens to `#0a0a0a` ink.

### 5.3 Category Tabs & Badges

- **Category Tab:** Pill shape (`rounded-full`), inactive: transparent + `text-muted`; active: `bg-surface-card` + `text-ink` + subtle shadow.
- **Badge Pill:** 12–13px text, uppercase tracking 1.5px, pill radius, background matched to category badge tokens (Data/Agents/Orchestration/Execution).

---

## 6. Motion & Animation Rules

### 6.1 Motion Token Definitions (CSS Variables)
- `--clay-ease-out`: `cubic-bezier(0.22, 1, 0.36, 1)` — standard scroll reveal deceleration.
- `--clay-ease-deck`: `cubic-bezier(0.16, 1, 0.3, 1)` — card deck transitions.
- `--clay-ease-spring`: `cubic-bezier(0.34, 1.56, 0.64, 1)` — spring overshoot micro-interactions.

### 6.2 Applied Motion Rules
1. **Hero Stagger:** Autoplay looping video; headline/sub/CTAs fade-up on mount (0ms / 100ms / 200ms delay).
2. **Infinite Marquee:** Infinite horizontal marquee for social proof / bento stat cards (`translateX` loop, ~40s duration, pause on hover).
3. **Card Press Interaction:** Press scale-down (`scale: 0.97`) with smooth release via Reanimated.
4. **Scroll Reveal:** IntersectionObserver / entrance animation, fade-up 24px → 0px, 700ms `--clay-ease-out`.
5. **No Layout Animations:** Animate transform and opacity only — never animate layout bounds (width/height/top/left).

---

## 7. Mobile React Native Implementation Mapping (`app/`)

### 7.1 Architecture & Stack
- **Framework:** NativeWind v5 + Tailwind CSS v4 + `react-native-css`.
- **Bridge:** `@/tw` primitives wrap React Native components with `useCssElement(Comp, props, { className: 'style' })`.
- **CSS Tokens:** Defined in `src/global.css` `@theme` block and exposed as Tailwind utility classes (`bg-canvas`, `text-ink`, `rounded-xl`, `text-display-md`).

### 7.2 Compound Utilities (`src/tw/cn.ts`)

```ts
import { cn, clayInput, clayCard, clayFeatureCardBase, clayButtonBase } from '@/tw/cn';

clayInput           // 'h-11 py-3 bg-canvas border border-hairline rounded-md px-4 text-body-md text-ink'
clayCard            // 'bg-canvas border border-hairline rounded-lg p-6'
clayFeatureCardBase // 'rounded-xl p-8 gap-3'
clayButtonBase      // 'h-11 py-3 rounded-md px-5 flex-row items-center justify-center gap-2'
```

### 7.3 Component Inventory (`src/components/clay/`)

| Mobile Component | File | Primitives Path | Reanimated? | `.web.tsx`? | Role / Behavior |
|---|---|---|---|---|---|
| `ClayTabBar` | `ClayTabBar.tsx` | `@/tw` (View, Text) | Yes (`withSpring`) | No | Custom bottom tab bar with animated sliding indicator |
| `ClayAnimatedButton` | `ClayAnimatedButton.tsx` | Raw RN (`StyleSheet`) | Yes (`usePressAnimation`) | Yes (`.web.tsx`) | 4 variants (`primary`, `secondary`, `on-color`, `text-link`), press scale animation |
| `ClayAnimatedCard` | `ClayAnimatedCard.tsx` | `@/tw` (View, Pressable) | Yes (entrance + press) | No | Pressable card with entrance fade-in + press scale-down |
| `ClayFeatureCard` | `ClayFeatureCard.tsx` | `@/tw` (View, Text) | Yes (`useEntranceAnimation`) | No | Saturated single-color card (`pink`, `teal`, `lavender`, `peach`, `ochre`, `cream`) |
| `ClayAvatar` | `ClayAvatar.tsx` | `@/tw/image` | No | No | Circular avatar with placeholder fallback |
| `ClaySpinner` | `ClaySpinner.tsx` | Raw RN (`StyleSheet`) | Yes (`withRepeat`) | Yes (`.web.tsx`) | Loading spinner with optional label |

### 7.4 The `@/tw` vs Raw-RN Convention
- **Use `@/tw` primitives** by default (`View`, `Text`, `Pressable` from `@/tw`) for standard screens to consume CSS theme tokens automatically.
- **Use Raw RN (`StyleSheet.create`)** for animation-critical components or components avoiding NativeWind Android layout bugs (e.g. `ClayAnimatedButton`, `ClaySpinner`, `AuthScreen`). Document duplicated hex values with a comment `// from --color-X`.

### 7.5 Dual Reanimated Web Strategy (.web.tsx)
Any component using Reanimated provides a `.web.tsx` variant (e.g. `ClayAnimatedButton.web.tsx`, `ClaySpinner.web.tsx`, `src/tw/animated.web.tsx`). In addition, `metro.config.js` aliases `react-native-reanimated` and `react-native-worklets` to stubs on web (`src/lib/reanimated-web-stub.js`) to avoid web crashes (#8285).

---

## 8. Mobile Screen Design Decision Tree

When creating or updating screens in `src/app/(tabs)/`:
1. **Background:** Root element must use `bg-canvas` (`#fffaf0`). Android nav bar set to match in `_layout.tsx`.
2. **Headlines:** `font-display text-display-sm` (32px) or `text-display-md` (40px) for mobile screen titles.
3. **Body Copy:** `font-sans text-body-md text-body`. Secondary text: `text-muted`. Captions: `text-muted-soft`.
4. **Cards (Data/Content):** `ClayAnimatedCard` (interactive) or `clayCard` compound class on a `View` (static). `bg-canvas border-hairline rounded-lg p-6`.
5. **Feature Cards (Highlights):** `ClayFeatureCard` with `color="pink|teal|lavender|peach|ochre|cream"`. **Cycle colors** across lists — never repeat the same color twice sequentially.
6. **Buttons:** `ClayAnimatedButton` with `variant="primary|secondary|on-color|text-link"`.
7. **Inputs:** `clayInput` compound class on a `TextInput` from `@/tw`.
8. **Navigation:** Use `ClayTabBar` — never default expo-router tab bar.
9. **Animations:** Import from `@/hooks/useClayAnimations` — NEVER import `react-native-reanimated` directly in screens.

---

## 9. System Do's and Don'ts

### Do
- Anchor every page and mobile screen on the cream canvas (`--color-canvas` — `#fffaf0`).
- Cycle saturated feature cards across pages (Pink → Teal → Lavender → Peach → Ochre → Cream Card).
- Use Inter 500 (`font-display`) with negative letter-spacing for mobile headlines as the substitute for Plain Black / Nunito 700.
- Use `ClayAnimatedButton` with press scale animations (0.97) for all CTAs.
- Use cream footers and soft-tinted closing CTA bands — warm throughout pacing.
- Ensure top nav on web is fixed top with bottom rounded corners (`rounded-b-2xl`).

### Don't
- Don't use cool gray backgrounds. Cream `#fffaf0` is non-negotiable.
- Don't introduce a 7th brand-color card. Stick strictly to the 6-color palette.
- Don't bold display headlines beyond weight 500-600.
- Don't repeat the same feature card background color twice in a row.
- Don't use a dark navy footer.
- Don't import `react-native-reanimated` directly in screens — use `@/hooks/useClayAnimations`.

---

## 10. OpenCode Agent Harness Rules & Code Guidelines

*Rules for automated AI coding agents (OpenCode RAG / OpenAgent) working on this codebase:*

1. **Token Reference First**: When adding new UI elements, always use existing `--color-*`, `--radius-*`, `--spacing-*`, and typography utilities defined in `src/global.css`. Never add arbitrary hex colors in `@/tw` components.
2. **Import Paths**:
   - `View`, `Text`, `Pressable`, `ScrollView` from `@/tw`
   - `Image` from `@/tw/image` (NOT `react-native` or `expo-image`)
   - `AnimatedView` from `@/tw/animated`
   - `cn` and compound utilities from `@/tw/cn`
   - Animation hooks from `@/hooks/useClayAnimations`
3. **No Direct Reanimated Imports in Screens**: Always use `@/hooks/useClayAnimations` or `@/lib/reanimated-platform`.
4. **Web Safety (.web.tsx)**: When creating an animated component using Reanimated, you MUST create a matching `.web.tsx` file that uses plain React Native components for web stability (#8285).
5. **No `as any` or Bare `catch {}`**: Keep TypeScript strict mode clean (`tsc --noEmit`).

---

## 11. Known Technical Debt & Future Gaps

- **Duplicated Hex Values in Raw RN**: `ClayAnimatedButton.tsx:17-19`, `ClaySpinner.tsx:13-14`, and `AuthScreen.tsx:52-57` hardcode `#fffaf0`, `#0a0a0a`, `#e5e5e5`, `#6a6a6a` instead of reading CSS variables (due to RN `StyleSheet` runtime constraints).
- **Direct Reanimated Imports in 6 Components**: The animated components in `src/components/clay/` import `react-native-reanimated` directly instead of `@/lib/reanimated-platform`.
- **Form Validation Compounds**: `clayInput` lacks pre-built `clayInputError` and `clayInputSuccess` compound classes. Currently hand-rolled in `AuthScreen.tsx`.

---

## 12. References & Source Files

- **Live Site Verification:** [Clay.com](https://www.clay.com/), [Kaplun Tech](http://kaplun.tech/)
- **Original Spec Deck:** [DESIGN copy.md](file:///d:/Kaplun-app/DESIGN%20copy.md)
- **Token Source of Truth:** [src/global.css](file:///d:/Kaplun-app/src/global.css)
- **Compound Utilities:** [src/tw/cn.ts](file:///d:/Kaplun-app/src/tw/cn.ts)
- **Component System:** [src/components/clay/](file:///d:/Kaplun-app/src/components/clay/) (See `src/components/clay/AGENTS.md`)
- **Styling Primitives:** [src/tw/](file:///d:/Kaplun-app/src/tw/) (See `src/tw/AGENTS.md`)
- **Animation Hooks:** [src/hooks/useClayAnimations.ts](file:///d:/Kaplun-app/src/hooks/useClayAnimations.ts)
