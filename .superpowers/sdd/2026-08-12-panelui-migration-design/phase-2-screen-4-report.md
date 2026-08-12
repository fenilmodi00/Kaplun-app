# Phase 2, Screen 4 — Messages Thread PanelUI Migration Report

**Date:** 2026-08-12
**Branch:** `feat/panelui-migration`
**Commit:** `da5ad0a`
**Status:** Complete — all acceptance criteria met

## Summary

`src/screens/messages/thread.tsx` now renders with PanelUI components (`Message` + `MessageScroller` + `Input` per the spec's replacement table, plus `Badge`/`Button`/`EmptyState`/`Skeleton`/`Marker`/`Text`). Business logic (`useMessages` consumption, `getThreadById` thread-details fetch, `markAsRead` on mount, `handleSend`) is unchanged — only the UI layer moved. 158 insertions vs 141 deletions across 5 files; the screen no longer imports raw RN beyond `KeyboardAvoidingView` (in the allowed set), and its `scripts/check-structure.mjs` exception is removed. `AutomationDmPreview.tsx`'s `ClayAvatar` is swapped to PanelUI `Avatar` per the spec's Risks section, which deletes the last `clay/` consumer outside `clay/` itself.

## Component mapping applied

| Before | After | Notes |
|---|---|---|
| Inverted `FlatList` + `renderItem`/`keyExtractor` callbacks | `MessageScroller autoScroll` (`Viewport`/`Content`/`Item`/`Button`) | `listMessages` returns `Query.orderAsc('timestamp')`, so array order is already the non-inverted render order — no reordering needed. Scroller owns open-at-end, follow-new-while-at-bottom, and prepend preservation. Jump-to-latest button is its built-in `MessageScroller.Button`. |
| Hand-rolled bubble (`View max-w-[80%] rounded-lg` + `bg-brand-teal`/`bg-surface-card` palette classes) | `Message align="end"\|"start"` + `Message.Content/Bubble/BubbleContent/Header/Footer` | Creator → `end`, agent → `start`. Sender name rides `Message.Header`, timestamp rides `Message.Footer`. Bubble colors now resolve from theme tokens (PanelUI `bg-primary`/`bg-muted`), replacing the Clay teal/card palette by design of the migration. |
| System message (centered italic caption + timestamp) | `Marker` + `Marker.Content` + PanelUI `Text size="xs" muted` for the timestamp | Marker is the registry's "inline note between conversation turns" — exactly this semantic. Centered in a wrapper View to keep the old visual. |
| `@/tw` `TextInput` + `clayInput` compound utility | PanelUI `Input` (`containerClassName="flex-1"`, TextInput props pass through: `value/onChangeText/onSubmitEditing/returnKeyType`) | Removes this screen's last Clay compound utility import. PanelUI's `avoidKeyboard`/`KeyboardAvoider` NOT adopted — it wants the optional `react-native-keyboard-controller` peer (not installed; fallback is a deprecated Reanimated 4 keyboard hook that switches Android off `adjustResize`). Existing raw `KeyboardAvoidingView behavior="padding"` preserved, zero behavior risk. |
| `ClayAnimatedButton` (Send) | `Button` (`loading`, `disabled`) | `loading` auto-blocks presses; `disabled={!inputText.trim() \|\| sending}` logic unchanged. |
| Back button: raw `TouchableOpacity` + `Ionicons` + `useThemeColors().ink` | `Button size="icon" variant="ghost" accessibilityLabel="Back"` + `Ionicons` colored via `useCSSVariable('--color-foreground') as string` | Same pattern as home screen #1 for icon colors. 44×44 hit target handled by `size="icon"`. |
| Hand-rolled status chip (`STATUS_META` Clay palette record + `cn`) | `Badge variant` with `STATUS_VARIANT: Record<string, BadgeVariant>` | **Duplicated verbatim from `messages/index.tsx`** — the task forbids touching that file, so the map can't be extracted to a shared module yet. Same statuses → same variants; `?? 'secondary'` guard for unknown DB statuses. |
| `ui/error-state.tsx` (`ErrorState` + shake) | `EmptyState` (Title "Couldn't load messages" + Description=error + `Button variant="outline"` Retry) | Same pattern as list screen #3. |
| Plain centered text empty state | `EmptyState` (Title "No messages yet" + Description "Start the conversation.") | Consistent with sibling screens. |
| Hand-rolled loading boxes (`bg-white border-hairline` inline styles) | `Skeleton` × 3 (`h-11`/`h-14`, self-start/end alternation preserved) | |
| Per-message `Reanimated.View entering={SlideInUp}` | **Removed** | MessageScroller owns transcript motion (fade/follow); the AGENTS.md `SlideInUp as any` smell note no longer exists in the pre-migration file (it was `SlideInUp` without a cast) and the wrapper is now gone entirely. `@/lib/reanimated-platform` import removed. |
| `bg-canvas` / `border-hairline` / `text-ink` / `text-muted` Clay tokens | `bg-background` / `border-border` / PanelUI `Text` defaults + `muted` prop | Same token mapping as screens 1–3. |
| `useThemeColors()` hook | Removed | Last usage was the back-chevron color; `useCSSVariable` replaces it. No color lookups remain. |

## Intentionally kept (spec-sanctioned)

- **Raw `KeyboardAvoidingView`** — in check-structure's allowed import set; PanelUI's keyboard composer machinery requires an uninstalled optional peer (see mapping notes).
- **`@/tw` `View`** — layout primitive; PanelUI has no replacement.
- **`getThreadById` / data layer** — the reported "direct `tablesDB.getRow()`" smell lives *inside* `getThreadById` in `repository.ts`; the screen already goes through the repository. Nothing to preserve or change at the screen level.
- **`useSafeAreaInsets`/`TAB_BAR_OVERLAY` padding math** — header top padding and input-bar bottom clearance unchanged.

## Files changed

| File | Change |
|---|---|
| `src/screens/messages/thread.tsx` | Full UI-layer rewrite; ~230 → ~215 LOC. Dead imports removed: `FlatList`, `Platform`, `TouchableOpacity`, `Animated`, `@/lib/reanimated-platform`, `TextInput` + `Text` from `@/tw`, `cn`/`clayInput`, `ClayAnimatedButton`, `ErrorState`, `useThemeColors`. |
| `src/components/automation/AutomationDmPreview.tsx` | `ClayAvatar` → PanelUI `Avatar` at both call sites: header (`size={35}` → `size="sm"`, ~32 px) and empty-flow hero (`size={64}` → `size="xl"`). New local `initials()` helper feeds `fallback` (first letters of first two words, `?` for empty). **IG palette untouched** — all `#000000` / `#5B51D8→#C13584` / `#262626` styles remain. |
| `src/screens/messages/thread.test.tsx` | Removed the stale per-file `ClayAnimatedButton` mock (screen no longer imports it). No test bodies changed — all 8 assertions pass against the migrated screen. |
| `jest.setup.ts` | Mock extended with `Input` (raw RN `TextInput` passthrough), `Marker` (+Icon/Content), `Message` (+7 parts), `MessageScroller` (+4 parts); comment header updated. **Bug fix:** shared `viewPassthrough` was the `Object.assign` target for every compound family, so part names collided globally and last-write-won (`Message.Content`'s view renderer clobbered `Marker.Content`'s text renderer — 6 red tests). Introduced `family(parts)` factory, one fresh root per family; converted all 9 families. |
| `scripts/check-structure.mjs` | Removed `src/screens/messages/thread.tsx` from EXCEPTIONS (14 entries remain). |

## Deviation justification

1. **`jest.setup.ts` mock internals restructured** (not just extended). The shared-mutation bug was latent since screen #1 and only fired now because `Marker` vs `Message` disagree on the `Content` part's renderer. The `family()` factory makes the bug structurally unrepeatable; full-suite re-run confirms screens 1–3 tests still pass against the isolated roots (274/2, unchanged baseline).
2. **Empty state copy split** from one line ("No messages yet — start the conversation") into EmptyState Title + Description. No test pins the old string.
3. **Skeleton shapes kept as plain widths/heights** matching the old boxes (70%/55%/65% × 44/56 px); `Skeleton` replaces only the fill/border styling.
4. Faulty task detail noted: the task said `thread.tsx` "calls `tablesDB.getRow()` directly" and "casts `Reanimated.SlideInUp as any`" — the pre-migration file did neither (the getRow call is inside `getThreadById`; the SlideInUp had no cast). Migration proceeded against the real code.

## Verification

| Check | Result |
|---|---|
| `bun run lint` (`tsc --noEmit`) | PASS (0 errors) |
| `npx jest --testPathPattern=thread` | PASS — 8/8 |
| `npx jest` (full suite — covers home/insights/messages-list + automate/new consumer of AutomationDmPreview) | 274 passed / 2 failed — both are the documented pre-existing `ui-components.test.tsx` `Input` style assertions (same baseline as screens 1–3) |
| `node scripts/check-structure.mjs` | PASS (exit 0) with thread.tsx removed from EXCEPTIONS |
| `as any` / `@ts-ignore` / `@ts-expect-error` | None introduced (one `as string` on `useCSSVariable`, the established screen-1 pattern, not an `as any`) |
| Theme switching | All colors are PanelUI component internals, semantic tokens (`bg-background`, `border-border`), or `useCSSVariable`-driven — follow `Uniwind.setTheme` by construction |
| Clay/import audit | No `clay/`, `clayInput`, `@expo/ui`, `react-native-reanimated`, or `ui/error-state` imports remain in the screen; AutomationDmPreview is `clay/`-free (last consumer outside `clay/`) |

## Open items for the orchestrator

- **Device/visual QA not run** — type+test+token verification only. Eyeball thread in light + dark: bubble hue shift (Clay teal/card → PanelUI primary/muted), back button ghost hit area, and the `Marker` alignment vs the old centered caption.
- **`STATUS_VARIANT` map is duplicated** between `messages/index.tsx` and `messages/thread.tsx` because touching index.tsx was out of scope. Extract to `src/screens/messages/status-variant.ts` on a later cross-cutting pass (e.g. alongside Phase 3 cleanup).
- **`Avatar` `size="sm"`/`"xl"` are the nearest named sizes**, not the exact 35 px/64 px ClayAvatar pixels. Acceptable for the IG-simulation preview; if pixel parity matters, audit PanelUI's size scale and className-override.
- **PanelUI composer keyboard machinery available later** — if `react-native-keyboard-controller` is ever installed, the input bar can drop raw `KeyboardAvoidingView` for `Input avoidKeyboard keyboardMode="dock"`.
- **Message list is unvirtualized now** — `MessageScroller` is a ScrollView, not FlatList. Fine for deal-thread volumes; if a thread ever renders hundreds of messages, revisit.
