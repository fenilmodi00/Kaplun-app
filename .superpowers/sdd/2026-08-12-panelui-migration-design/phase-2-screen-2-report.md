# Phase 2, Screen 2 — Insights Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Status:** Complete — all acceptance criteria met

## Summary

`src/screens/insights/index.tsx` now renders with PanelUI components. Business logic (period state, `useInsights` consumption, reconnect OAuth + cache invalidation, refresh) is unchanged; only the UI layer moved. The screen went from 631 to 480 lines; `components.tsx` was deleted (its `SkeletonBlock` is replaced by PanelUI `Skeleton`, and `Reveal` is now imported directly from `@/components/ui/reveal`).

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| `KpiCard` (hand-rolled View) | `Kpi` + `Kpi.Stat/Title/Value` + muted `Text` sub | 4 separate surfaces in the 2×2 grid; each wrapped in a `basis 48%` View because `Kpi`'s `className` lands on the inner body, not its `Surface`. |
| `ReachChartCard` (hand-rolled Pressable bars) | `Card` + `BarChart` (`Bar`, `XAxis ticks={4}`, `Tooltip`) | `BarChart.Tooltip` owns the pan gesture; selection latches via `onActiveIndexChange` (index ≥ 0 only — the gesture's `-1` finalize is ignored), so the header readout + Reset survive finger lift. Out-of-range index after a period change resolves to null via a bounds guard. |
| `FollowersCard` (saturated `bg-brand-teal`, white mini-bars) | `Kpi surface={false} colorIndex={3}` with `bg-success-soft` tint, `Kpi.Trend variant="badge"`, `Kpi.Chart` sparkline | Line sparkline, not bars: BarChart's zero-baseline domain would render 1490→1500 as identical full-height bars (their docs warn against cropping bars). The trend badge replaces the white delta chip and brings its own arrow. |
| `TopPostsCard/tile` (`bg-surface-card border-hairline`) | `Card` + `Card.Header/Title/Description/Content` + re-tokened tiles | Tile `Image` kept (`@/tw/image`). Scrim-over-photo type badge uses `bg-black/50` + `#ffffff` glyph (image overlay, not a themed surface — same carve-out as home's IG gradient). |
| `ReconnectCard` + `ClayAnimatedButton` | `Card` + `Button` (`fullWidth`, `size="lg"`, `loading`, `startContent`) | Lavender icon circle → `bg-info-soft` token. |
| `InlineErrorStrip` (View + hardcoded `#ef4444`) | `Alert variant="destructive"` + trailing `Button size="sm"` Retry | Kills a hardcoded hex; `Alert.Content` flex-1 separates text from the action. |
| `PeriodToggle` (hand-rolled segmented pill) | `Chip selected onPress` ×2 (filter-bar idiom) | PanelUI has no segmented control; the docs' filter-bar pattern is the idiomatic equivalent and announces as a toggle for a11y. |
| `SkeletonBlock` (`./components.tsx`) | `Skeleton` | Direct PanelUI primitive with className sizing. "Updating…" dot → `bg-warning` (ochre equivalent). |
| `useThemeColors()` + `text-ink`/`bg-surface-card`/`border-hairline`/`text-muted*` | `useCSSVariable('--color-*')` for Ionicons + semantic Tailwind classes (`text-foreground`, `bg-card`, `border-border`, `text-muted-foreground`) | Same token mapping as Screen 1. Font sizes mapped onto the PanelUI `Text` scale (11→xs, 12.5–13.5→xs/sm, 19→lg, 24→2xl, 28→3xl via `Kpi.Value` override, 32→3xl). |

## Intentionally kept / dropped

- **`Badge`** (listed in the task spec) ended up unused — `Kpi.Trend variant="badge"` covers the one chip this screen had.
- **Max-bar ochre highlight + per-bar tap labels** on the reach chart dropped in favor of the library's pan/scrub + tooltip + dim-the-rest idiom. Per-bar accessibility replaced by a summary `accessibilityLabel` on the chart. Deliberate simplification: the native equivalent of the old press interaction is the pan gesture, which only exists inside `BarChart.Tooltip`.
- **`@/tw` `View`/`Pressable`, `@/tw/image`, `Ionicons`, `ScreenShell`, `Reveal`** — kept per spec (PanelUI has no replacements).

## Files changed

| File | Change |
|---|---|
| `src/screens/insights/index.tsx` | Full UI-layer rewrite; logic untouched. Zero Clay imports, zero `@expo/ui`, zero `useThemeColors`, zero raw-RN imports. |
| `src/screens/insights/components.tsx` | **Deleted** — one-line `Reveal` re-export inlined; `SkeletonBlock` superseded by PanelUI `Skeleton`. |
| `jest.setup.ts` | `panelui-native` mock extended (shared test seam, same as Screen 1): added `Chip`, `Kpi` (+12 parts; `Trend` renders the formatted label so `getByText('+10')` matches), `BarChart` (+8 parts, visuals stubbed to null), and `Alert.Content`. |
| `scripts/check-structure.mjs` | **No change needed** — the insights screen has no raw `react-native` imports before or after migration (verified: `node scripts/check-structure.mjs` exits 0). |

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (0 errors) |
| `npx jest --testPathPattern=insights` | PASS — 14/14 (2 suites) |
| `node scripts/check-structure.mjs` | PASS (exit 0) — no edit required |
| `npx jest` (full) | 273 passed / 3 failed — 2 are the documented pre-existing `ui-components.test.tsx` Input assertions; 1 is `useAutomationGate.test.tsx` ("Not signed in" vs expected token error), **verified pre-existing on clean HEAD** (`git stash` + rerun showed the same suite failing there). Unrelated to this screen. |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced |
| Theme switching | All colors are className tokens or `useCSSVariable`-driven Ionicons colors — both follow the Uniwind theme. |

## Test text contract preserved

Every string the existing tests assert still renders through text-bearing mock parts: `Insights`, `@test_creator · Last 28 days`, KPI values (`270`, `4.2K`, `310`, `1.5K`), `+10` (exactly once — the Trend badge), `Followers`/`Reach` (twice each — getAllByText), `Top posts`, `120`, `12`, the three empty-state copy blocks, both reconnect titles, `Reconnect Instagram`, `Couldn't load insights —` regex, `Retry`, `Updating…`. No test file changes were needed.

## Open items for the orchestrator

- **`useAutomationGate.test.tsx` failure is pre-existing and order-dependent** (passes some runs, fails others on clean HEAD; seen failing both stashed and unstashed). Worth a triage ticket — looks like `useAppwriteUser` mock state leaking between suites.
- **`ScreenShell` still uses dead `bg-canvas` Clay token** — carried over from Screen 1's open items; cross-screen re-token (`bg-background`) still pending.
- **Device/visual QA not run** — type+test+token verification only. Eyeball the reach BarChart proportions (`aspectRatio={2.6}`) and the Chip toggle sizing on a real device before calling the design done.
