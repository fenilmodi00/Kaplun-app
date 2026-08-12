# Phase 2, Screen 3 — Messages List PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `931ae3b`
**Status:** Complete — all acceptance criteria met

## Summary

`src/screens/messages/index.tsx` now renders with PanelUI components. Business logic (`useThreads` consumption, `router.push` to thread detail, `keyExtractor`) is unchanged; only the UI layer changed. 106 insertions vs 76 deletions across 2 files; screen is 162 pure LOC (was ~164).

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| `ClayAnimatedCard` + hand-rolled row layout | `Item variant="outline"` + `Item.Media`/`Item.Content`/`Item.Title`/`Item.Description` | Press feedback moves from ClayAnimatedCard's mount stagger to Item's AnimatedPressable. The `index`/`delay` stagger prop is gone (PanelUI Item has no mount-stagger slot); row identity is unchanged. |
| (no avatar) | `Avatar fallback={initials 2-letter slice}` in `Item.Media` | Spec's replacement table lists `Avatar` for this screen. No avatar URL exists on `DealThread` — initials are `campaign_title.slice(0,2).toUpperCase()`. |
| Hand-rolled unread pill (`min-w[22px]` Text, manual `99+` clamp) | `Badge variant="destructive" count={unread}` | PanelUI clamps to `99+` internally (identical behavior, less code) and sets an "N unread" accessibility label. |
| `STATUS_META` className record (7 Clay palette entries, `cn()` merged) | `STATUS_VARIANT: Record<string, BadgeVariant>` | Palette → semantic mapping: invited→info, negotiating→warning, contracted→success, content_pending→default, live→success, completed→secondary, declined→destructive. Type is `React.ComponentProps<typeof Badge>['variant']` — no `as any`, tracks upstream. |
| `ui/error-state.tsx` (`ErrorState` + ClayAnimatedButton + shake) | `EmptyState` + `Button variant="outline"` | Spec mapping: error-state.tsx → `EmptyState`. Shake wrapper dropped (it lived inside the deleted component; home kept its own `ErrorShake` because the strip there is inline, not a full state). |
| Plain Text empty state | `EmptyState` (Title + Description) | |
| Hand-rolled loading placeholders (3 white boxes, `style` borderRadius/height) | `Skeleton` × 3 (`h-24 rounded-xl`) | |
| `@/tw` `Text` (title 21px inline style, `letterSpacing: -0.4`) | PanelUI `Text` (`size="xl" weight="semibold" className="tracking-tight"`) | Same mapping as home header (21→xl). |
| `bg-canvas` / `bg-white` / `border-hairline` tokens | `bg-background` (root) / PanelUI component surfaces | Clay tokens gone from this screen. |

## Intentionally kept (spec-sanctioned)

- **Raw `FlatList` from `react-native`** — spec keeps `@/tw` primitives where PanelUI has no direct replacement; FlatList is in check-structure's allowed import set, so **no `scripts/check-structure.mjs` change was needed** for this screen (verified: script exits 0).
- **`ScreenShell`** (`center` variant for error/empty) — unchanged; its internal dead `bg-canvas` token remains the known cross-screen open item from Screen 1's report.
- **`useSafeAreaInsets`** — header top padding / list bottom clearance unchanged.
- **`index.tsx` now also has pull-to-refresh** — see Deviations.

## Files changed

| File | Change |
|---|---|
| `src/screens/messages/index.tsx` | Full UI-layer rewrite. Dead code removed: `cn` import, `useScreenContentPadding` import + unused `padding` binding, `ThreadRow`'s unused-via-migration `index` prop. |
| `jest.setup.ts` | `panelui-native` mock extended with `EmptyState` (+5 parts) and `Item` (+9 parts). Item root renders `Pressable` when given `onPress` (else `View`), mirroring the real component; text-bearing parts (`Title`, `Description`) render a real RN `Text` so `getByText` queries keep matching. |

## Deviation justification

1. **Pull-to-refresh added, not just preserved.** The pre-migration FlatList had **no** `onRefresh`/`refreshControl`; the task's expected-outcome text lists pull-to-refresh as required functionality. Wired via FlatList's built-in `onRefresh={refresh} refreshing={loading}` — no new imports (RefreshControl stays unimported, check-structure untouched), no hook changes. Caveat: `useThreads`' `loading` is the initial-load flag, so the native refresh spinner is only visible if a refetch overlaps it; making the spinner track refetch properly would mean changing the hook's return contract, which is outside this task's "business logic unchanged" constraint.
2. **Avatar added to rows.** No avatar existed before; the spec's replacement column lists `Avatar` for this screen, and Item's leading media slot is the idiomatic home for it.
3. **`thread.tsx` untouched** — still the raw-RN escape hatch (Screen 4 task), still in check-structure's exception list.

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (0 errors) |
| `npx jest --testPathPattern=messages/index` | PASS — 8/8 |
| `npx jest` (full) | 274 passed / 2 failed — both are the documented pre-existing `ui-components.test.tsx` `Input` style assertions (same as Screen 1 baseline) |
| `node scripts/check-structure.mjs` | PASS (exit 0, no new exceptions) |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced |
| Theme switching | All colors are PanelUI component internals or semantic className tokens (`bg-background`, `muted`) — follow theme by construction |
| Pure LOC | 162 (healthy band) |

## Open items for the orchestrator

- **Device/visual QA not run** — type+test+token based verification only from this environment. Eyeball the list in light + dark, particularly Badge variant hues vs the old Clay palette (content_pending's lavender has no direct PanelUI variant; it maps to `default`).
- **`useThreads` could expose `isRefetching`** — if the refresh spinner should be reliably visible during pull-to-refresh, the hook needs an extra return field; cross-cutting hook change deferred as out of scope.
- **jest.setup.ts mock** now covers: Text/Button/Card/Surface/Avatar/Badge/Chip/Alert/Skeleton/EmptyState/Item/Kpi/BarChart + providers. Extend (don't shadow) for later screens.
