# Phase 2, Screen 8 — Profile Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `66c7edf`
**Status:** Complete — all acceptance criteria met (full-project lint blocked only by a concurrent operator's in-flight `src/screens/score/share-card.tsx`; profile files type-check clean)

## Summary

`src/screens/profile/index.tsx` now renders with PanelUI components on semantic tokens. Business logic (hooks, disconnect/sign-out handlers, avatar spring entrance, tab-bar clearance) is unchanged; only the UI layer moved. 241 insertions vs 612 deletions across 5 files — the entire `buildStyles` `StyleSheet.create` block (280+ lines), the raw-RN import block, and the `useThemeColors()` dependency are gone. `scripts/check-structure.mjs` no longer lists this screen as a raw-RN exception.

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| `StyleSheet.create` + raw RN `View/Text/Image/Pressable/ScrollView` | PanelUI components + `@/tw` layout primitives with `className` | Raw-RN escape hatch retired. |
| `ClayAnimatedButton` ×3 (disconnect, sign-out, empty refresh) | `Button` (`variant="secondary"` / default / `variant="outline"`, `fullWidth`) | |
| Custom `Image` + fallback initial `View` | `Avatar size="lg" source fallback accessibilityLabel` | Spring entrance kept — `Animated.View` wraps the `Avatar`. |
| Hand-rolled count pills (`surfaceCard` bg) | `Badge variant="secondary"` | |
| Accent badges (mint/lavender/peach hexes) | `Badge variant="success"/"info"/"warning"` | Hue-faithful semantic mapping; `ACCENTS` hex table deleted. |
| Deal status pill via `statusMeta(t)` hex map | `Badge variant={statusBadgeVariant(status)}` | `statusMeta`/`ThemeColors` coupling replaced by a pure `string → BadgeVariant` function. |
| Unread count bubble (error hex) | `Badge variant="destructive" count={n}` | PanelUI clamps to `99+`. |
| Skeleton placeholders (3 views + 2 cards) | `Skeleton` with matching Tailwind dims | |
| `ui/error-state` `ErrorState` | PanelUI `EmptyState` + `Button variant="outline"` retry | Also drops this screen's last transitive `ClayAnimatedButton` pull — `ErrorState` itself is shared Phase 3 territory and was not modified. |
| Dark/Light segmented pill (2 `Pressable`s) | `Switch` settings row (`value={preference === 'dark'}`) | State seam unchanged: `useThemePreference()`/`setThemePreference()` (it persists + drives `Uniwind.setTheme`); PanelUI's `useThemeMode().toggleMode()` was the alternative but would bypass AsyncStorage persistence. |
| Reel thumbnails (raw `Image`, 160×200) | `@/tw/image` `Image` + Tailwind dims (`w-40 h-52`) in a bordered card row | |
| Section titles (`buildStyles` entries) | `SectionTitle` → `Text size="lg" weight="semibold"` | |
| `useThemeColors()` / `ThemeColors` | Deleted — zero raw color needs left | |

## Supporting changes

- **`src/screens/profile/utils.ts`** — `statusMeta(t)` + `ACCENTS` deleted; new `statusBadgeVariant(status)` maps the 7 deal statuses to semantic Badge variants (`invited→info`, `negotiating→warning`, `contracted`/`live→success`, `content_pending→info`, `declined→destructive`, unknown/completed→secondary`, matching the old fallback). `formatCount` untouched. Profile-local copies only — `automate/detail/utils.ts` has its own separate hex table.
- **`src/screens/profile/utils.test.ts`** — hex-pinning assertions replaced with a table-driven variant-mapping test (same per-status coverage + unknown-status fallback). Task allowed test edits.
- **`jest.setup.ts`** — one mock fix at the shared `wrapTextChild` helper: JSX interpolation (`{`${count} followers`}`) arrives at the mock as an **array** of children, not a single string; previously only lone strings/numbers were wrapped, and arrays crashed the reconciler with "Text strings must be rendered within a <Text>". Now recursively wraps array items. Benefits Badge/Button/Chip and all later screens.
- **`scripts/check-structure.mjs`** — `src/screens/profile/index.tsx` removed from `EXCEPTIONS` (zero raw RN imports remain; guard verified green without it).

## Deviation justification

1. **Theme toggle is a `Switch`, not the old 2-button pill.** The spec row lists `Switch` as the replacement; the persistence seam (`setThemePreference`) is kept, so hydration + Uniwind sync behave identically. Adjacent `Text` labels ("Dark mode" + description) carry the a11y naming — PanelUI `Switch` doesn't extend ViewProps, so a label on the control itself isn't available (matches the inherited quirk; screen-6's config rows do the same).
2. **`ErrorState` replaced by inline PanelUI `EmptyState`** (screen-6 pattern) instead of keeping the shared component — the shared one still imports `ClayAnimatedButton`, which this task requires out of the profile render tree. `ErrorState` file itself untouched (out of scope).
3. **Template-literal Badge labels** (`{`${formatCount(...)} followers`}`) so the label is one string child — preserves exact-match `getByText` queries under the mock and avoids split text nodes in production too.

## Verification

| Check | Result |
|---|---|
| `npx jest --testPathPattern=profile --forceExit` | PASS — 21/21 (11 screen + 10 utils) |
| `bun run lint` (`tsc --noEmit`) | Profile files CLEAN — the only project errors are `src/screens/score/share-card.tsx` (concurrent operator's in-flight screen-10 work; verified dirty in `git status` pre-commit, filtered to zero profile/jest.setup/check-structure matches) |
| `node scripts/check-structure.mjs` | PASS (exit 0) after exception removal |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced |
| Theme switching | All colors now PanelUI internals or semantic className tokens (`bg-background`, `border-border`, `bg-card`, `bg-muted`); toggle drives the existing `setThemePreference` seam |

## Open items for the orchestrator

- **Device/visual QA not run** — no Metro/EAS from this environment. Eyeball the creator card (`Avatar lg` + secondary count badges), the deal row's `Badge` pairs, and the theme `Switch` row in both schemes.
- **`Switch` mock has no fireable `onValueChange`** — no test exercises the theme toggle; if a later screen tests it, the mock needs a Pressable root (as the screen-5 report's role-based mock discussion notes).
- **`ErrorState` (`src/components/ui/error-state.tsx`)** still uses `ClayAnimatedButton` + `bg-canvas` — now orphaned by this screen too; remaining consumers are Phase 3 cleanup.
- **Concurrent-worktree lint**: full green `bun run lint` requires the score-screen operator to land their `share-card.tsx` fix (or revert); no action needed from this screen's scope.
