# Professional UI Rules & Pre-Delivery Checklist — Kaplun App

Load this file before final delivery of any screen or component in the Kaplun React Native app, or when the user reports the UI "doesn't look professional."

These rules target iOS/Android/React Native interfaces: touch targets, safe areas, platform gestures, and native-feeling motion.

## Icons & Visual Elements

| Rule | Standard | Avoid | Why It Matters |
|---|---|---|---|
| **No Emoji as Structural Icons** | Use `SymbolIcon` from `@/components/symbol-icon` (Ionicons / SF Symbols). | Using emojis for navigation, settings, or system controls. | Emojis are font-dependent, inconsistent across platforms, and cannot be controlled via design tokens. |
| **Vector-Only Assets** | Use SVG or platform vector icons that scale cleanly and support theming. | Raster PNG icons that blur or pixelate. | Ensures scalability and dark/light mode adaptability. |
| **Stable Interaction States** | Use color, opacity, or scale transitions for press states without changing layout bounds. | Layout-shifting transforms that move surrounding content. | Prevents unstable interactions and visual jitter. |
| **Consistent Icon Sizing** | Define icon sizes as tokens (e.g., 20 / 24 / 32 pt). | Mixing arbitrary values randomly. | Maintains rhythm and visual hierarchy. |
| **Stroke Consistency** | Use a consistent stroke width within the same visual layer. | Mixing thick and thin stroke styles arbitrarily. | Inconsistent strokes reduce perceived polish. |
| **Filled vs Outline Discipline** | Use one icon style per hierarchy level. | Mixing filled and outline icons at the same hierarchy level. | Maintains semantic clarity and style coherence. |
| **Touch Target Minimum** | Minimum 44×44 pt interactive area; use `hitSlop` if icon is smaller. | Small icons without expanded tap area. | Meets accessibility and platform usability standards. |
| **Icon Alignment** | Align icons to text baseline and maintain consistent padding. | Misaligned icons or inconsistent spacing. | Prevents subtle visual imbalance. |
| **Icon Contrast** | WCAG contrast: 4.5:1 for small elements, 3:1 minimum for larger UI glyphs. | Low-contrast icons that blend into background. | Ensures accessibility in both themes. |

## Interaction (App)

| Rule | Do | Don't |
|---|---|---|
| **Tap feedback** | Provide clear pressed feedback (opacity/scale/elevation) within 80–150 ms. | No visual response on tap. |
| **Animation timing** | Keep micro-interactions around 150–300 ms with platform-native easing. | Instant transitions or slow animations (> 500 ms). |
| **Accessibility focus** | Ensure screen reader focus order matches visual order and labels are descriptive. | Unlabeled controls or confusing focus traversal. |
| **Disabled state clarity** | Use `disabled` prop, reduced emphasis, and no tap action. | Controls that look tappable but do nothing. |
| **Touch target minimum** | Tap areas ≥ 44×44 pt (iOS) or ≥ 48×48 dp (Android). | Tiny tap targets or icon-only hit areas without padding. |
| **Gesture conflict prevention** | One primary gesture per region; avoid nested tap/drag conflicts. | Overlapping gestures causing accidental actions. |
| **Semantic native controls** | Prefer `Pressable`, `Button`, or Clay components with proper roles. | Generic `View` containers used as primary controls without semantics. |

## Light/Dark Mode Contrast

| Rule | Do | Don't |
|---|---|---|
| **Surface readability (light)** | Keep cards/surfaces clearly separated from background. | Overly transparent surfaces that blur hierarchy. |
| **Text contrast (light)** | Body text contrast ≥ 4.5:1 against light surfaces. | Low-contrast gray body text. |
| **Text contrast (dark)** | Primary text ≥ 4.5:1; secondary text ≥ 3:1 on dark surfaces. | Dark-mode text that blends into background. |
| **Border and divider visibility** | Ensure separators are visible in both themes. | Theme-specific borders disappearing in one mode. |
| **State contrast parity** | Pressed/focused/disabled states equally distinguishable in both themes. | Defining interaction states for one theme only. |
| **Token-driven theming** | Use semantic color tokens mapped per theme. | Hardcoded per-screen hex values. |
| **Scrim and modal legibility** | Modal scrim strong enough to isolate foreground (typically 40–60 % black). | Weak scrim that leaves background competing. |

## Layout & Spacing

| Rule | Do | Don't |
|---|---|---|
| **Safe-area compliance** | Respect top/bottom safe areas for fixed headers, tab bars, and CTA bars. | Placing fixed UI under notch, status bar, or gesture area. |
| **System bar clearance** | Add spacing for status/navigation bars and home indicator. | Tappable content colliding with OS chrome. |
| **Consistent content width** | Predictable content width per device class. | Mixing arbitrary widths between screens. |
| **8 pt spacing rhythm** | Use 4/8 pt spacing system for padding/gaps/section spacing. | Random spacing increments with no rhythm. |
| **Readable text measure** | Long-form text readable on large devices. | Edge-to-edge paragraphs on tablets. |
| **Section spacing hierarchy** | Clear vertical rhythm tiers (e.g., 16/24/32/48 pt). | Similar UI levels with inconsistent spacing. |
| **Adaptive gutters** | Increase horizontal insets on larger widths and in landscape. | Same narrow gutter on all sizes/orientations. |
| **Scroll and fixed element coexistence** | Add content insets so lists are not hidden behind fixed bars. | Scroll content obscured by sticky headers/footers. |

## Pre-Delivery Checklist

Before delivering app UI code, verify every item below.

### Process
- [ ] Read `src/global.css` and the relevant Clay/`@/tw` files before designing.
- [ ] Reviewed `quick-reference.md` §1–§3 (CRITICAL + HIGH) as a final pass.
- [ ] Verified on small phone (375 px width) and landscape orientation.
- [ ] Verified behavior with **reduced-motion** enabled and **largest system text size**.
- [ ] Checked dark mode contrast independently (never assume light-mode values carry over).
- [ ] Confirmed all touch targets ≥ 44 pt and no content hidden behind safe areas.

### Visual Quality
- [ ] No emojis used as icons (use `SymbolIcon`).
- [ ] All icons come from a consistent icon family and style.
- [ ] Pressed-state visuals do not shift layout bounds or cause jitter.
- [ ] Semantic theme tokens are used consistently (no ad-hoc per-screen hardcoded colors).

### Interaction
- [ ] All tappable elements provide clear pressed feedback (opacity/scale/elevation).
- [ ] Touch targets meet minimum size (≥ 44 pt iOS, ≥ 48 dp Android).
- [ ] Micro-interaction timing stays in the 150–300 ms range with native-feeling easing.
- [ ] Disabled states are visually clear and non-interactive.
- [ ] Screen reader focus order matches visual order, and interactive labels are descriptive.
- [ ] Gesture regions avoid nested/conflicting interactions (tap/drag/back-swipe conflicts).

### Light/Dark Mode
- [ ] Primary text contrast ≥ 4.5:1 in both light and dark mode.
- [ ] Secondary text contrast ≥ 3:1 in both light and dark mode.
- [ ] Dividers/borders and interaction states are distinguishable in both themes.
- [ ] Modal/drawer scrim opacity is strong enough to preserve foreground legibility.
- [ ] Both themes are tested before delivery (not inferred from a single theme).

### Layout
- [ ] Safe areas are respected for headers, tab bars, and bottom CTA bars.
- [ ] Scroll content is not hidden behind fixed/sticky bars.
- [ ] Verified on small phone, large phone, and tablet (portrait + landscape).
- [ ] Horizontal insets/gutters adapt correctly by device size and orientation.
- [ ] 4/8 pt spacing rhythm is maintained across component, section, and page levels.
- [ ] Long-form text measure remains readable on larger devices.

### Accessibility
- [ ] All meaningful images/icons have `accessibilityLabel`.
- [ ] Form fields have labels, hints, and clear error messages.
- [ ] Color is not the only indicator of state or meaning.
- [ ] Reduced motion and dynamic text size are supported without layout breakage.
