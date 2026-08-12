# Phase 2, Screen 10 — Score Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `48b0116` — `feat(score): migrate score screen to PanelUI Card/Kpi/Badge/Button/Text (Phase 2, screen 10)`
**Status:** Complete — all acceptance criteria met

## Summary

All 5 TS-UI files in `src/screens/score/` (`index.tsx`, `components.tsx`, `ceremony.tsx`, `scorecard.tsx`, `share-card.tsx`) migrated to PanelUI. `share.ts` and `index.test.tsx` needed no changes. Business logic (ceremony phase machine, timers constant values, score generation, share flow, hidden 9:16 capture target) is unchanged; only the UI layer moved. 208 insertions vs 275 deletions. `useThemeColors()` is gone from all 7 call sites; `lightColors` is gone from `share-card.tsx`; all Clay imports (`ClayAnimatedButton`, `ClayAnimatedCard`, `ClayFeatureCard`, `ClaySpinner`) are gone.

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| `ClayAnimatedButton` (gate CTA, empty-state CTA, share CTA) | `Button variant="primary" fullWidth loading` + `startContent` Ionicons glyph | insights `ReconnectCard` pattern; glyph icon stays `logo-instagram` on both connect/reconnect variants as before. |
| `ClayFeatureCard color="teal"` hero | `Kpi surface={false}` + `rounded-2xl bg-success-soft p-5` + `Kpi.Value className="text-5xl tracking-tighter"` | insights `FollowersCard` pattern. Teal→green is the sanctioned global palette shift (Clay accent tokens were deleted in Phase 1). `score_label` white pill → `Badge variant="success"`, `/100` → `Text size="base" muted mb-1.5`. |
| `ClayAnimatedCard` (StaggeredCard, strengths/weaknesses) | `Reveal` (`@/components/ui/reveal`) + `Card` | Same delay math (`ceremony ? i*100 : 60+i*40`, strengths/weaknesses delays unchanged). `Reveal` is the established stagger primitive from screens 1–2. `StaggeredCard` export location and `padding` prop kept (maps to `Card className`). |
| Hand-rolled priority pills (`bg-brand-pink/ochre/lavender` + manual Text) | `Badge variant="destructive"/"warning"/"info"` | `Record<ActionPriority, {variant,label}>` replaces `PRIORITY_STYLE`; typed against Badge variants, no `cn` needed. Label casing unchanged (`High`/`Medium`/`Low`). |
| `GateCard` / `EmptyState` hand-rolled surface-card Views | `Card className="items-center gap-3 p-5"` + icon circle + `Text` | insights `ReconnectCard` pattern. Icon circles: `bg-brand-lavender`→`bg-info-soft`, `bg-brand-teal`→`bg-success-soft`, glyph `useCSSVariable('--color-foreground')` both. Old EmptyState glyph was ink-on-teal; foreground-on-soft-tint is the insights convention. |
| Local `InlineErrorStrip` | `Alert variant="destructive"` + `Alert.Indicator/Content/Description` + `Button variant="secondary" size="sm"` retry | insights pattern verbatim; message text `Couldn’t load your score — {message}` preserved (test regex depends on it). |
| `ScoreSkeleton` gray boxes | `Skeleton` (`h-48`/`h-30`/`h-50 rounded-2xl`) | insights `DataSkeleton` pattern. 190/120/200px → nearest 4pt-grid steps. |
| `ClaySpinner size={18} color="primary"` (theater stage) | `Spinner size="sm"` | PanelUI Spinner sizes are sm/md/lg only. |
| `SectionLabel` 11px/manual tracking | `Text size="xs" weight="semibold" muted uppercase tracking-wider` | |
| Screen header (32px/13px manual) | `Text size="3xl" weight="medium" tracking-tight` + `size="sm" muted` | insights header pattern. |
| `useThemeColors()` (7 sites) | `useCSSVariable('--color-foreground' / '--color-muted-foreground' / '--color-primary' / '--color-primary-foreground' / '--color-border')` | Icons, ring arcs (`primary`), ring track (`border` replaces `hairline`), ring label pill (`bg-primary` + `primary-foreground` text), shareError `text-destructive` class. |
| `lightColors` import (share-card) | Local static hex const (identical values: `#fffaf0/#0a0a0a/#6a6a6a/#9a9a9a/#f5f0e0/#1a3a3a/#ffffff`) | Task-sanctioned: brand asset pinned to canonical light palette regardless of in-app scheme; `useCSSVariable` would follow the (dark-default) theme and break the pinned asset. |

## Share-card ref simplification

The old `React.createElement` dance existed because the pre-Phase-1 `@/tw` View was a function component whose props TYPE omitted `ref`. Since Phase 1 `@/tw` View is a direct `RNView` alias, so `ref` now goes through plain JSX (`<View ref={ref} collapsable={false} …>`). The stale `useCssElement` comment was deleted with it. `captureRef` target semantics unchanged (share tests green).

**Deliberate exception:** share-card keeps `@/tw` `Text` (plain RNText) rather than PanelUI `Text` — PanelUI Text's base class is `text-foreground`, which follows the dark-default in-app scheme (#f5f5f5 near-white on a cream asset). Style luck of the draw (inline beats className) is not the pinning mechanism this component should depend on; zero themed defaults is.

## jest.setup.ts

**No changes needed.** Everything this screen imports from `panelui-native` (`Card`, `Kpi`, `Badge`, `Button`, `Text`, `Skeleton`, `Spinner`, `Alert`) was already mocked by earlier screens, and per the stored convention all text-bearing parts render real RN `Text`, so the 17 existing `getByText` assertions pass unmodified.

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | **Zero errors in score files.** Whole-project run currently fails only in the concurrent operator's in-flight `src/components/auth/AuthScreen.test.tsx` (untracked, screen 9) — their `Promise`-typed render queries; untouched by and unrelated to this migration. |
| `npx jest --testPathPattern=score --forceExit` | PASS — 17/17, unmodified test file |
| `npx jest --forceExit` (full) | 276 passed / 3 failed — 1 documented pre-existing `ui-components.test.tsx` Input style assertion + 2 in the same in-flight `AuthScreen.test.tsx`. All migrated-screen suites pass, score included. |
| `node scripts/check-structure.mjs` | PASS (exit 0). Score was never raw-RN/StyleSheet, so no exception-list entry existed and none was added. |
| `as any` / `@ts-ignore` / `@ts-expect-error` / `useThemeColors` / `lightColors` / `clay/` grep over `src/screens/score/*.tsx` | Clean |
| LSP diagnostics | TypeScript LSP not installed in this harness (user declined); `tsc --noEmit` coverage substituted. |

## Open items for the orchestrator

- **Device/visual QA not run** (no Metro/EAS here). Worth eyeballing in both themes: hero `Kpi` on `bg-success-soft` (teal→green shift), priority `Badge` colors vs the old pink/ochre/lavender pills, and the ring label pill (`bg-primary` inverts between schemes by design).
- **The share PNG needs one visual sanity check** after Phase 3 lands — `share-card` is deliberately pinned to the legacy light palette while the rest of the app migrated to the PanelUI palette, so the legacy "cream" asset and the new "Panel light" chrome are cousins, not twins. If brand decides the asset should follow the new light theme, that is a one-const change.
- **Lint gate is currently red on a file outside this screen's scope** (`AuthScreen.test.tsx`, in-flight screen-9 work by a concurrent operator). Re-run `bun run lint` once screen 9 lands.
