# Quick Reference — Full Rule Set

Load this file when doing a UI review/audit pass or when you need the full checklist for a category beyond the priority table in `SKILL.md`. These rules are stack-agnostic; for Kaplun-specific implementation guidance, read `kaplun-stack.md`.

## 1. Accessibility (CRITICAL)

- `color-contrast` — Minimum 4.5:1 ratio for normal text (large text 3:1); Material Design / WCAG.
- `focus-states` — Visible focus rings on interactive elements (2–4 px; Apple HIG, Material).
- `alt-text` — Descriptive alt text / accessibilityLabel for meaningful images.
- `aria-labels` — `aria-label` or `accessibilityLabel` for icon-only buttons.
- `keyboard-nav` — Tab order matches visual order; full keyboard support where relevant.
- `form-labels` — Use visible label with associated input.
- `heading-hierarchy` — Sequential heading levels, no skips.
- `color-not-only` — Don't convey info by color alone; add icon or text.
- `dynamic-type` — Support system text scaling; avoid truncation as text grows (Apple Dynamic Type).
- `reduced-motion` — Respect `prefers-reduced-motion`; reduce/disable animations when requested.
- `voiceover-sr` — Meaningful `accessibilityLabel`/`accessibilityHint`; logical reading order.
- `escape-routes` — Provide cancel/back in modals and multi-step flows.

## 2. Touch & Interaction (CRITICAL)

- `touch-target-size` — Min 44×44 pt (iOS) / 48×48 dp (Android); extend `hitSlop` if icon is smaller.
- `touch-spacing` — Minimum 8 pt gap between touch targets.
- `hover-vs-tap` — Use tap for primary interactions; don't rely on hover alone.
- `loading-buttons` — Disable button during async operations; show spinner or progress.
- `error-feedback` — Clear error messages near the problem.
- `standard-gestures` — Use platform standard gestures consistently; don't redefine.
- `system-gestures` — Don't block system gestures (Control Center, back swipe, home gesture).
- `press-feedback` — Visual feedback on press (opacity/scale/elevation) within 80–150 ms.
- `haptic-feedback` — Use haptic for confirmations and important actions; avoid overuse.
- `gesture-alternative` — Don't rely on gesture-only interactions for critical actions.
- `safe-area-awareness` — Keep primary touch targets away from notch, Dynamic Island, gesture bar.
- `no-precision-required` — Avoid pixel-perfect taps on small icons or thin edges.
- `swipe-clarity` — Swipe actions must show clear affordance or hint.
- `drag-threshold` — Use a movement threshold before starting drag.

## 3. Performance (HIGH)

- `image-optimization` — Use WebP/AVIF, responsive sizing, lazy-load non-critical assets.
- `image-dimension` — Declare width/height or aspect-ratio to prevent layout shift.
- `font-loading` — Avoid invisible text during load; reserve font space.
- `lazy-loading` — Lazy-load non-hero components / screens.
- `bundle-splitting` — Split code by route/feature where the bundler supports it.
- `reduce-reflows` — Avoid frequent layout reads/writes; batch DOM/native layout passes.
- `content-jumping` — Reserve space for async content.
- `virtualize-lists` — Virtualize lists with 50+ items.
- `main-thread-budget` — Keep per-frame work under ~16 ms for 60 fps.
- `progressive-loading` — Use skeleton screens instead of long blocking spinners for > 1 s operations.
- `input-latency` — Keep input latency under ~100 ms for taps/scrolls.
- `tap-feedback-speed` — Provide visual feedback within 100 ms of tap.
- `debounce-throttle` — Use debounce/throttle for high-frequency events.
- `offline-support` — Provide offline state messaging and basic fallback.

## 4. Style Selection (HIGH)

- `style-match` — Match style to product type and brand.
- `consistency` — Use the same visual language across all screens.
- `no-emoji-icons` — Use vector icons (SVG / SF Symbols / Ionicons), not emojis.
- `color-palette-from-product` — Choose palette from product/industry context.
- `effects-match-style` — Shadows, blur, radius aligned with chosen style.
- `platform-adaptive` — Respect iOS HIG vs Material idioms.
- `state-clarity` — Make hover/pressed/disabled states visually distinct.
- `elevation-consistent` — Use a consistent elevation/shadow scale.
- `dark-mode-pairing` — Design light/dark variants together.
- `icon-style-consistent` — One icon family and style across the product.
- `system-controls` — Prefer native/system controls unless branding requires custom.
- `blur-purpose` — Use blur to indicate background dismissal, not as decoration.
- `primary-action` — One primary CTA per screen; secondary actions subordinate.

## 5. Layout & Responsive (HIGH)

- `mobile-first` — Design mobile-first, then scale up.
- `breakpoint-consistency` — Use systematic breakpoints.
- `readable-font-size` — Minimum 16 px body text on mobile.
- `line-length-control` — Mobile 35–60 chars per line; desktop 60–75.
- `horizontal-scroll` — No horizontal scroll on mobile.
- `spacing-scale` — Use 4 pt / 8 pt incremental spacing system.
- `touch-density` — Comfortable spacing for touch; not cramped.
- `z-index-management` — Define layered elevation scale.
- `fixed-element-offset` — Fixed nav/bottom bar must reserve safe padding.
- `scroll-behavior` — Avoid nested scroll regions that fight main scroll.
- `orientation-support` — Keep layout readable in landscape.
- `content-priority` — Show core content first on mobile.
- `visual-hierarchy` — Establish hierarchy via size, spacing, contrast — not color alone.

## 6. Typography & Color (MEDIUM)

- `line-height` — Use 1.5–1.75 for body text.
- `font-pairing` — Match heading/body font personalities.
- `font-scale` — Consistent type scale.
- `contrast-readability` — Darker text on light backgrounds.
- `text-styles-system` — Use platform type roles (iOS Dynamic Type / Material type scale).
- `weight-hierarchy` — Bold headings (600–700), regular body (400), medium labels (500).
- `color-semantic` — Define semantic tokens (primary, secondary, error, surface, on-surface).
- `color-dark-mode` — Dark mode uses desaturated/lighter tonal variants, not inverted colors.
- `color-accessible-pairs` — Foreground/background ≥ 4.5:1 (AA) or 7:1 (AAA).
- `truncation-strategy` — Prefer wrapping; when truncating use ellipsis + full-text fallback.
- `whitespace-balance` — Use whitespace intentionally to group and separate.

## 7. Animation (MEDIUM)

- `duration-timing` — 150–300 ms for micro-interactions; complex transitions ≤ 400 ms.
- `transform-performance` — Use `transform`/`opacity` only; avoid width/height/top/left.
- `loading-states` — Show skeleton or progress when loading exceeds 300 ms.
- `excessive-motion` — Animate 1–2 key elements per view max.
- `easing` — Use ease-out for entering, ease-in for exiting.
- `motion-meaning` — Every animation must express cause-effect, not just decorate.
- `state-transition` — State changes should animate smoothly, not snap.
- `continuity` — Screen transitions maintain spatial continuity.
- `spring-physics` — Prefer spring/physics-based curves for natural feel.
- `exit-faster-than-enter` — Exit animations ~60–70 % of enter duration.
- `stagger-sequence` — Stagger list/grid entrances by 30–50 ms per item.
- `interruptible` — Animations must be interruptible by user input.
- `no-blocking-animation` — Never block input during animation.
- `scale-feedback` — Subtle scale (0.95–1.05) on press for tappable elements.
- `gesture-feedback` — Drag/swipe/pinch provide real-time visual response.
- `navigation-direction` — Forward = left/up; backward = right/down; keep consistent.
- `layout-shift-avoid` — Animations must not cause layout reflow.
- `reduced-motion` — Respect system reduced-motion settings.

## 8. Forms & Feedback (MEDIUM)

- `input-labels` — Visible label per input; not placeholder-only.
- `error-placement` — Show error below the related field.
- `submit-feedback` — Loading then success/error state on submit.
- `required-indicators` — Mark required fields.
- `empty-states` — Helpful message and action when no content.
- `toast-dismiss` — Auto-dismiss toasts in 3–5 s.
- `confirmation-dialogs` — Confirm before destructive actions.
- `input-helper-text` — Persistent helper text below complex inputs.
- `disabled-states` — Disabled elements use reduced opacity + semantic prop.
- `progressive-disclosure` — Reveal complex options progressively.
- `inline-validation` — Validate on blur, not keystroke.
- `input-type-keyboard` — Use semantic input types to trigger correct mobile keyboard.
- `autofill-support` — Use autocomplete / `textContentType` so the system can autofill.
- `undo-support` — Allow undo for destructive or bulk actions.
- `success-feedback` — Brief visual feedback for completed actions.
- `error-recovery` — Error messages state cause + how to fix.
- `multi-step-progress` — Show step indicator; allow back navigation.
- `form-autosave` — Auto-save drafts for long forms.
- `sheet-dismiss-confirm` — Confirm before dismissing sheet with unsaved changes.
- `error-clarity` — "Invalid input" is not enough; state cause and fix.
- `focus-management` — After submit error, focus first invalid field.
- `touch-friendly-input` — Mobile input height ≥ 44 pt.
- `destructive-emphasis` — Destructive actions use danger color and are visually separated.

## 9. Navigation Patterns (HIGH)

- `bottom-nav-limit` — Bottom navigation max 5 items; labels with icons.
- `drawer-usage` — Drawer/sidebar for secondary navigation, not primary actions.
- `back-behavior` — Back navigation predictable and consistent; preserve state.
- `deep-linking` — All key screens reachable via deep link / route.
- `tab-bar-ios` — iOS: bottom Tab Bar for top-level navigation.
- `top-app-bar-android` — Android: Top App Bar for primary structure.
- `nav-label-icon` — Navigation items have both icon and text label.
- `nav-state-active` — Current location visually highlighted.
- `nav-hierarchy` — Clearly separate primary vs secondary nav.
- `modal-escape` — Modals/sheets offer clear close affordance; swipe-down on mobile.
- `search-accessible` — Search easily reachable; provide recent/suggested queries.
- `state-preservation` — Navigating back restores scroll, filter, input state.
- `gesture-nav-support` — Support iOS swipe-back and Android predictive back.
- `tab-badge` — Badges on nav items used sparingly.
- `overflow-menu` — Use overflow menu when actions exceed space.
- `bottom-nav-top-level` — Bottom nav is for top-level screens only.
- `back-stack-integrity` — Never silently reset the navigation stack.
- `navigation-consistency` — Nav placement stays the same across screens.
- `avoid-mixed-patterns` — Don't mix Tab + Sidebar + Bottom Nav at same hierarchy.
- `modal-vs-navigation` — Modals not used for primary navigation flows.
- `persistent-nav` — Core navigation reachable from deep pages.
- `destructive-nav-separation` — Dangerous actions separated from normal nav items.

## 10. Charts & Data (LOW)

- `chart-type` — Match chart type to data type.
- `color-guidance` — Accessible palettes; avoid red/green only for colorblind users.
- `data-table` — Provide table alternative; charts alone are not screen-reader friendly.
- `pattern-texture` — Supplement color with patterns/textures/shapes.
- `legend-visible` — Always show legend near chart.
- `tooltip-on-interact` — Tooltips on hover/tap showing exact values.
- `axis-labels` — Label axes with units and readable scale.
- `responsive-chart` — Reflow or simplify on small screens.
- `empty-data-state` — Meaningful empty state, not blank chart.
- `loading-chart` — Skeleton/shimmer while loading.
- `animation-optional` — Respect reduced motion; data readable immediately.
- `large-dataset` — Aggregate or sample 1000+ points.
- `number-formatting` — Locale-aware formatting.
- `touch-target-chart` — Interactive chart elements ≥ 44 pt tap area.
- `no-pie-overuse` — Avoid pie/donut for > 5 categories.
- `contrast-data` — Data lines/bars ≥ 3:1; labels ≥ 4.5:1.
- `direct-labeling` — For small datasets, label values directly.
