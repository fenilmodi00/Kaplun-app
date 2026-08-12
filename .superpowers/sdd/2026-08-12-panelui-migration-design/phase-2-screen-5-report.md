# Phase 2, Screen 5 — Automate List Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `ed746c2`
**Status:** Complete — all acceptance criteria met

## Summary

`src/screens/automate/index.tsx` now renders with PanelUI components. Business logic (connection gate, OAuth connect, stats, list queries, toggle mutation, scroll→tab-bar reporting, routes) is byte-identical; only the UI layer changed. 127 insertions vs 115 deletions across 3 files. The `@expo/ui` Host/Switch island is gone from this screen.

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| `ClayAnimatedButton` (connect CTA, empty-state CTA) | `Button` (`fullWidth`, `size="lg"`, `loading`, `startContent` IG glyph) | Same pattern as home's connect hero. |
| `@expo/ui` `Host` + `Switch` per-row toggle | `Switch` (styled, non-native) | `Host matchContents colorScheme seedColor` wrapper deleted; `useThemeMode` import removed. `onValueChange: () => void` still type-checks (fewer params OK). |
| Hand-rolled `bg-error` pill ("Reconnect needed") | `Badge variant="destructive"` | |
| Hand-rolled `bg-surface-card` pill ("-- sent") | `Badge variant="secondary"` | |
| `StatsCard` bordered View | `Card` + `Card.Content` | Manual `fontSize: 24` → `Text size="2xl" weight="semibold"`; 13px → `size="sm" muted`. |
| `ConnectionGate` `bg-brand-lavender` View | `Surface bordered padding="lg"` | Same dead-Clay-token fix as home (lavender had no dark story). |
| Local `EmptyState` function | PanelUI `EmptyState` (`Header`/`Title`/`Content` + `Button`) | Local function renamed path deleted; no name collision. |
| `ui/error-state` `ErrorState` | PanelUI `EmptyState` + `Button variant="outline"` retry | Same pattern as messages list screen. |
| `AutomationRow` Pressable card | `Item orientation="vertical" variant="outline" onPress` with `Item.Content`, `Item.Footer`, `Item.Title`, `Item.Description` | Target/keywords kept as two separate `Item.Description` nodes with a `•` separator — preserves exact pre-migration text nodes (and exact-match test queries) and the original truncation behavior. |
| `SkeletonRow` bordered View | `Skeleton` (`h-[88px] rounded-xl`) | Original height kept. |
| Header `bg-ink/[0.06]` pressed-style add button | `@/tw` Pressable `bg-secondary` + Ionicons `add` | `useThemeColors` dropped; icon color via `useCSSVariable('--color-foreground')`. |
| Dead Clay tokens throughout | PanelUI/Uniwind tokens | `bg-canvas`→`bg-background`, `text-ink`→`text-foreground`/default Text, `text-muted(-soft)`→`muted` prop, `border-hairline`→`border-border`, component-internal surfaces. Inline `fontSize/lineHeight` styles gone. |

## Intentionally kept (spec-sanctioned)

- **`@/tw` `View`/`Pressable`/`ScrollView`** — layout primitives per spec ("keep where PanelUI doesn't have a direct replacement").
- **RN `FlatList` (+ `type NativeScrollEvent`)** — list virtualization + tab-bar scroll reporting; in `check-structure.mjs` ALLOWED_RN, so **no exception-list change was needed** for this screen (verified exit 0).
- **`Ionicons`** — logo-instagram brand glyph + add icon; colors via `useCSSVariable` so they follow theme switches.
- **`TAB_BAR_CLEARANCE` / `reportTabBarScroll`** — tab-bar clearance + scroll-driven hide/show, unchanged.

## jest.setup.ts mock change (required)

Added `Switch` to the global `panelui-native` mock:

```tsx
Switch: (props: any) =>
  React.createElement(View, { accessible: true, accessibilityRole: 'switch', ...props }, props?.children),
```

`accessible: true` + `accessibilityRole: 'switch'` mirror the real component (its root is a `Pressable`, which defaults `accessible`). **Why the role matters:** RNTL 14's `*ByRole` query filters by `isAccessibilityElement` first — a host View with only `accessibilityRole` is NOT an accessibility element (View is not in the Text/TextInput/Switch host list, and `accessible` defaults undefined), so a role-only mock is invisible to `getByRole`. This cost one failed test round; mock detail is now documented here for later screens (Switch appears again in screens 6–9).

## Deviation justification

1. **`index.test.tsx` modified** (task allowed "possibly"): PanelUI `Switch` does not forward `testID` at all — `SwitchProps` doesn't extend ViewProps and the implementation spreads nothing extra onto its root Pressable (verified in `node_modules/panelui-native/src/components/switch/index.tsx`), so `testID="automation-switch"` was a compile error with no escape hatch (no `as any` allowed). The toggle test was switched from `getAllByTestId('automation-switch')` + `fireEvent(el, 'valueChange')` to `getAllByRole('switch')` + same `fireEvent`. The role query is a strictly better assertion (verifies the control announces itself as a switch); the valueChange event still lands on `onValueChange` in the mock.
2. **`@expo/ui` removal confirmed**: this was one of the 4 importer files per spec; import block is now `@expo/ui`-free. Remaining importers after this commit: `ui/switch.tsx`, `ui/bottomsheet/index.tsx`, `automate/new/index.tsx` (screens 7 + Phase 3 work).
3. **Extracted `AutomationsErrorState`** as a named function (was inline `ErrorState` JSX) purely to mirror the extracted `AutomationsEmptyState` and keep each early-return branch at the same depth; no behavior change.

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (exit 0) |
| `npx jest --testPathPattern=automate/index` | PASS — 6/6 |
| `npx jest` (full) | 274 passed / 2 failed — both are the documented pre-existing `ui-components.test.tsx` `Input` style assertions (identical to screen-1 baseline; one earlier run flaked a 3rd failure, not reproducible) |
| `node scripts/check-structure.mjs` | PASS (exit 0), no edit needed |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced (grepped) |
| Theme switching | All colors are PanelUI component internals, semantic className tokens, or `useCSSVariable`-driven Ionicons colors |

## Open items for the orchestrator

- **Device/visual QA not run** — no Metro/EAS from this environment. Eyeball the automation row (`Item` in vertical orientation with a `Footer` split row: sent badge vs Switch) and the `Surface` connection gate in both themes before calling the design done. `Item.Footer`/`Item.Content` carry `w-full` classNames defensively for the justify-between layout.
- **`Item` in `orientation="vertical"`** — this screen is the first Kanplun usage of vertical Items with Footer; if PanelUI's vertical spacing differs visually from the old `p-3.5 gap-2` card, tune via `Item` className, not custom wrappers.
- **jest.setup.ts mock**: `Switch` added; later screens still need Select/Dialog/OtpInput/etc. — extend the same mock, don't shadow per-file.
