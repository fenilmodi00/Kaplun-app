# Phase 2, Screen 6 — Automate Detail Screen PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `ab1569b`
**Status:** Complete — all acceptance criteria met

## Summary

`src/screens/automate/detail/index.tsx` (and its sibling `components.tsx` + `utils.ts`) now render with PanelUI components. The raw React Native + `StyleSheet.create` escape hatch is gone from this screen folder. Business logic (param parsing, automations/logs/stats hooks, automation lookup, reply-pool derivation, stats computation, pause/resume toggle, delete) is byte-identical to the pre-migration version; only the UI layer and the delete-confirmation mechanism changed. 330 insertions vs 570 deletions across 6 files.

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| Raw RN `View`/`Text`/`Pressable` + `StyleSheet.create` (documented escape hatch) | `@/tw` `View`/`Pressable` + PanelUI `Text`/`Badge`/`Card`/`Item`/`Alert`/`EmptyState` on semantic className tokens | `StyleSheet.create` and the `buildStyles(t)` factory deleted entirely. `useThemeColors` removed from both files. |
| `ClayAnimatedButton` (Retry, Pause/Resume, Delete) | `Button` (`variant`, `fullWidth`, `size`, `accessibilityLabel`) | Retry → `variant="outline"` inside `EmptyState.Content`; Delete → `variant="destructive"` `fullWidth` Dialog trigger. |
| Pause/Resume `ClayAnimatedButton` | `Switch` (`value={!isPaused}`, `onValueChange={handlePauseResume}`) in a Configuration card row labeled "Active" | Matches the spec's named `Switch` replacement and the settings-row idiom from PanelUI docs. `onValueChange: (v: boolean) => void` accepts the existing `() => void` handler. |
| `Alert.alert(...)` delete confirmation | `Dialog` + `Dialog.Trigger`/`Content`/`Title`/`Description`/`Footer`/`Close` | Uncontrolled; `Dialog.Close` composes the child's `onPress` (which calls `deleteAutomation`) then closes — mirrors the real component's `cloneElement` composition. |
| Hand-rolled status pill (`statusMeta` hex bg/text) | `Badge` (`variant` from `statusBadgeVariant`) + `labelClassName="capitalize"` | active→`success`, paused→`warning`, error→`destructive`. |
| Hand-rolled action badge (`actionMeta` hex bg/text) | `Badge` (`variant` from `actionBadgeVariant`, label from `actionLabel`) | sent family→`success`, skipped→`warning`, failed→`destructive`, pending→`secondary`. |
| Hand-rolled keyword chip | `Badge variant="secondary"` | |
| `noticeCard` (live/paused) tinted Views | `Alert variant="success"`/`"warning"` with `Alert.Indicator`/`Content`/`Title`/`Description` | Indicator picks the status icon from the variant. |
| `configCard` bordered View + rows | `Card` + `Card.Header`/`Card.Title` + `Card.Content` (rows via new `ConfigRow`) | `ConfigRow({ label, children })` extracted to `components.tsx` to dedupe the 10 label/value rows. |
| `LogRow` bordered View + nested Views | `Item` + `Item.Content` (with `Item.Title`/`Item.Description`) + `border-b border-border` className | Time moved into the title row (top-right) to preserve the original layout; badges row stays below the comment. |
| `StatCell` View+Text | `@/tw` `View` + PanelUI `Text` (`weight="semibold"` value, `size="sm" muted` label) | Kept simple (no `Kpi`) — the spec row for this screen lists `Card`/`Item`/`Switch`/`Dialog`, not `Kpi`. |
| Error state (centered Text + Retry button) | `EmptyState` + `EmptyState.Header`/`Title`/`Description` + `EmptyState.Content`/`Button variant="outline"` | Same pattern as screens 3 and 5. |
| `ACCENTS` hex map + `actionMeta(t)`/`statusMeta(t)` (theme-color returns) | `actionBadgeVariant`/`actionLabel`/`statusBadgeVariant` (Badge variant returns) | `ACCENTS` and the `ThemeColors` import dropped from `utils.ts`. `computeStats` refactored to share the `SENT_ACTIONS` set. |
| `Ionicons` color via `t.ink` | `useCSSVariable('--color-foreground') as string` | Established pattern from screens 1 and 5; follows theme switches. |
| Dead Clay tokens (`t.canvas`/`t.ink`/`t.muted`/`t.hairline`/`t.surfaceCard`/`t.mutedSoft`) | PanelUI/Uniwind tokens (`bg-background`, `border-border`, `Text muted`, component internals) | |

## Intentionally kept (spec-sanctioned)

- **`@/tw` `View`/`Pressable`** — layout primitives per spec ("keep `@/tw` where PanelUI doesn't have a direct replacement").
- **RN `FlatList`** — list virtualization; in `check-structure.mjs` `ALLOWED_RN`, so no exception-list entry is needed for this screen (verified exit 0).
- **`Ionicons`** (`chevron-back`) — back-button glyph; color via `useCSSVariable` so it follows theme switches.
- **`useSafeAreaInsets` + `TAB_BAR_OVERLAY`** — header top padding + footer bottom clearance, unchanged.
- **`ConfigRow`** — a 2-prop local component (not an abstraction-for-later): 10 call sites in `index.tsx` justified extracting the repeated label/row wrapper.

## jest.setup.ts mock change (required)

Added `Dialog` to the global `panelui-native` mock. Unlike the existing stateless `family(parts)` mocks, `Dialog` needs open-state semantics to mirror the real component (`DialogContent` returns `null` when closed; `Dialog.Trigger`/`Dialog.Close` clone their child and compose `onPress`). Implemented as a self-contained IIFE inside the mock factory:

- `React.createContext` for open state (controlled `open` prop honoured, else internal `useState`).
- `DialogTrigger` / `DialogClose` use `React.cloneElement` to wrap the child's `onPress` (call it, then `setOpen(true|false)`) — exactly what the real source in `node_modules/panelui-native/src/components/dialog/index.tsx` does.
- `DialogContent` returns `null` when `!open`, else renders a `View` passthrough.
- `DialogTitle`/`DialogDescription` are `textPassthrough`; `DialogFooter` is `viewPassthrough`.

This lets the delete-confirmation test press the trigger, see the dialog content mount, then press the labelled confirm button — the same flow a user takes. No `as any` / `@ts-ignore` introduced (one `as string` on `useCSSVariable`, matching the established home-screen pattern; `React.createContext(null)` without a generic to satisfy `tsc`'s "untyped function calls may not accept type arguments" rule on the `require('react')` value).

## Deviation justification

1. **`index.test.tsx` modified** (task allowed "possibly"): the delete test moved from `jest.spyOn(Alert, 'alert')` to the Dialog flow (press trigger → assert title mounts → press `getByLabelText('Confirm delete')` → assert `deleteAutomation` called). The two pause/resume tests moved from `getByText('Pause')`/`getByText('Resume')` to `getByRole('switch')` + `fireEvent(el, 'valueChange')` (Switch mock already carries `accessible: true` + `accessibilityRole: 'switch'` from screen 5). The `Alert` import was removed from the test file. All 18 tests pass.
2. **`utils.ts` API changed**: `actionMeta(t)`/`statusMeta(t)` (returning `{bg, text, label}`) became `actionBadgeVariant(action)`/`actionLabel(action)`/`statusBadgeVariant(status)` (returning Badge variants + labels). Verified via grep that `utils.ts` is imported only within `src/screens/automate/detail/` (index.tsx + components.tsx) — `src/tw/AGENTS.md` line 43 references the file path in a doc list but does not import it. No external breakage.
3. **`components.tsx` API changed**: `StatCell`/`LogRow` no longer take a `styles` prop (StyleSheet is gone); `ConfigRow` added. `AutomationStyles` type export removed from `index.tsx`. Verified no external importers.
4. **`check-structure.mjs`**: removed `src/screens/automate/detail/index.tsx` and `src/screens/automate/detail/components.tsx` from `EXCEPTIONS` (per spec step 6 — do not defer to Phase 3). The detail screen folder is now raw-RN-free except for the allowed `FlatList`. Script exits 0.
5. **`src/tw/AGENTS.md` line 43** still lists 5 raw-RN escape-hatch screens including `detail/index.tsx`, `detail/components.tsx`, and `messages/thread.tsx` (the latter already migrated by screen 4). This doc list is now stale. **Not updated** — the task's MUST NOT DO restricts file modifications to `src/screens/automate/detail/` + `scripts/check-structure.mjs` + `jest.setup.ts`. Flagged as an open item.

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (0 errors) |
| `npx jest --testPathPattern=automate/detail` | PASS — 18/18 (2 suites: `index.test.tsx` + `utils.test.ts`) |
| `npx jest` (full) | 273 passed / 3 failed — all 3 are the documented pre-existing baseline: 2× `ui-components.test.tsx` `Input` style assertions + 1× flaky `useAutomationGate.test.tsx` (timing). None in the detail screen, none caused by this change (verified `useAutomationGate.test.tsx` does not import `Dialog`/`panelui`). |
| `node scripts/check-structure.mjs` | PASS (exit 0) |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced (grepped) |
| Theme switching | All colors are PanelUI component internals, semantic className tokens (`bg-background`, `border-border`), or `useCSSVariable('--color-foreground')`-driven Ionicons color — all follow `Uniwind.setTheme` |

## Open items for the orchestrator

- **Device/visual QA not run** — no Metro/EAS from this environment. Eyeball the Configuration card (Card with 10 `ConfigRow`s + the Active `Switch` trailing), the `Item`-based log rows (bordered via `border-b border-border`), the `Alert` notices (success/warning variants), and the `Dialog` delete confirmation in both themes before calling the design done.
- **`src/tw/AGENTS.md` line 43** is stale — it lists `detail/index.tsx`, `detail/components.tsx`, and `messages/thread.tsx` as raw-RN escape hatches, but all three have now migrated. Update the doc list as cross-screen housekeeping (out of this task's file scope).
- **`jest.setup.ts` mock** now covers `Dialog`; later screens still need `Select`/`OtpInput`/etc. — extend the same mock, don't shadow per-file.
- **`max-w-[60%]`** on config values — relies on Uniwind's arbitrary-value support for `max-w-[<percentage>]`. If a future Uniwind version drops percentage arbitrary values, the value column would lose its width cap (cosmetic only; no test impact). Verify on device.
