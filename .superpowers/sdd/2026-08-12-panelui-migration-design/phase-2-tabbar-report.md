# Phase 2 — TabBar re-wire to Uniwind className

## Finding: file was already 90% migrated

The TabBar implementation in HEAD already imported `View`/`Pressable` from `@/tw`
(thin re-exports; Uniwind handles `className` natively on RN components since Phase 1),
already used `className` on both primitives, and had **zero** NativeWind/`react-native-css`
imports, no `useCssElement`, no `useUnstableNativeVariable`, no `StyleSheet.create`,
and no `useThemeColors()`. The remaining NativeWind-era residue was four static inline
style objects.

## Changes (`src/components/clay/TabBar.tsx`)

Static inline styles → Uniwind className:

| Where | Before | After |
|---|---|---|
| `TabButton` Pressable | `style={{ width: 48, minHeight: 44 }}` | `className="w-12 min-h-11 items-center justify-center"` |
| Icon holder `View` | `style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}` | `className="w-6 h-6 items-center justify-center"` |
| Root positioning `View` | `style={{ position: 'absolute', top/left/right/bottom: 0, justifyContent: 'flex-end' }}` | `className="absolute inset-0 justify-end"` |
| Pill row `View` | `style={{ paddingVertical: 8, paddingHorizontal: 6 }}` | `className="flex-row py-2 px-1.5"` |

## Deliberately kept inline (with reasons)

- **`ICON_LAYER` + animated styles on `Animated.View`** — Reanimated shared-value styles
  (`focus` swap, whole-pill `minimize` scale) are dynamic; no `className`-on-`Animated.View`
  precedent exists in the migrated codebase.
- **`marginBottom: insets.bottom + 8`** — derived from runtime safe-area insets, cannot be static.
- **`EdgeBlur` `height={insets.bottom + 8 + PILL_HEIGHT}` + absolute style** — inset-derived, dynamic.
- **`LinearGradient` rim (borderRadius 9999, padding 1, custom multi-stop `boxShadow`, `elevation: 18`)** —
  third-party component; Uniwind does not auto-process `className` on it, and the layered
  metallic `boxShadow` has no Tailwind utility. Metallic rim behavior unchanged.
- **Icon glyph colors (`#ffffff` / `rgba(255,255,255,0.38)`)** — passed into `SymbolIcon`
  (kept platform-native per spec). They sit on `GlassSurface`, which is intentionally
  dark charcoal in **both** schemes, so the white glyphs are scheme-invariant constants,
  not theme tokens. No `useThemeColors()` existed to replace with `useCSSVariable`.

## Kept as-is per spec

- TabBar stays **custom** — not replaced by PanelUI `Tabs` (content tabs ≠ navigation tabs).
- `SymbolIcon`, `EdgeBlur`, `GlassSurface`, scroll-driven scale, hide-on-`new`, haptics,
  sole-navigable-state logic: untouched.

## Files

- Modified: `src/components/clay/TabBar.tsx`
- Not modified: `src/components/clay/TabBar.test.tsx` (no changes needed — tests pass through
  plain RN primitives; `className` is inert in jest)
- Not modified: `jest.setup.ts` (no new mocks needed)

## Verification

- `bun run lint` (`tsc --noEmit`): clean, exit 0
- `npx jest --testPathPattern=TabBar --forceExit`: 9/9 pass, exit 0
  (baseline before edits was also 9/9 — the edits are pure styling-mechanism changes)
- No `as any` / `@ts-ignore` / `@ts-expect-error` introduced.

## Notes for Phase 3

- Per spec Phase 3 step 1, `TabBar.tsx` + `TabBar.test.tsx` move out of
  `src/components/clay/` to `src/components/tab-bar/` before `clay/` is deleted.
