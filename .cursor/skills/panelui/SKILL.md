---
name: panelui
description: >
  Kaplun UI specialist for PanelUI + Uniwind: build and restyle Expo/React Native screens with
  panelui-native components, semantic tokens, AMOLED dark theme, and Kaplun's @/tw primitives.
  Use when adding or changing screens/components, theming, overlays (Dialog/BottomSheet), forms,
  charts, chat/message UI, TabBar, or when something is unstyled; when the user mentions PanelUI,
  Uniwind, className styling, or visual polish on this app.
compatibility: Expo SDK 57+, React Native 0.86, Uniwind (Tailwind v4), Reanimated 4, panelui-native. Native-first; web is secondary.
---

# Kaplun UI — PanelUI + Uniwind

You implement Kaplun's mobile UI with **PanelUI** (`panelui-native`) and **Uniwind**, not Clay or NativeWind. Prefer composing library components over hand-rolled Views. Every colour is a semantic token; Kaplun's dark canvas is pure AMOLED `#000000`.

Upstream skill (general PanelUI): https://github.com/panel-ui/PanelUI/blob/main/skills/panelui/SKILL.md  
This file is the **Kaplun-specific** overlay — project conventions win when they conflict.

## Ground truth (read in this order)

1. `src/tw/AGENTS.md` — `@/tw` primitives, `cn()`, anti-patterns
2. `src/components/AGENTS.md` — kept custom kits (TabBar, bottomsheet, reveal, AuthScreen)
3. `src/global.css` — Uniwind + `panelui-native/theme.css` + AMOLED override
4. `src/lib/theme.ts` — preference store → `Uniwind.setTheme()` (dark default, OS ignored)
5. `src/app/_layout.tsx` — single `PanelUIProvider`, theme hydrate
6. Root `AGENTS.md` + `DESIGN.md` — stack + visual language

Kaplun details that don't belong in the critical path: [kaplun-stack.md](kaplun-stack.md).

## Stack snapshot

| Layer | Tech | Kaplun note |
|---|---|---|
| Components | `panelui-native` **package** | Import from `panelui-native` — not copied source (no `panelui.json` fork unless deliberately added) |
| Styling engine | Uniwind + Tailwind v4 | `className` on RN via Uniwind; `@/tw` = thin re-exports |
| Tokens | `panelui-native/theme.css` | Override dark `--color-background: #000000` in `src/global.css` |
| Theme API | `useThemeMode()` + `setThemePreference()` | Persist `@kaplun/theme-preference`; hydrate calls `Uniwind.setTheme` |
| Raw colour JS | `useCSSVariable('--color-*')` from `@/tw` or `uniwind` | Never hardcode hex (except IG preview / documented escape hatches) |
| Animation | Reanimated 4 via `@/lib/reanimated-platform` / `@/tw/animated` | Never import `react-native-reanimated` directly |
| Kept custom | TabBar, `@/components/ui/bottomsheet`, `reveal` | Do not replace with PanelUI BottomSheet/Tab bar without an explicit ask |

## How Kaplun consumes PanelUI

| What you find | Meaning | Import |
|---|---|---|
| `panelui-native` in `package.json` | **This project** — package mode | `import { Button } from 'panelui-native'` |
| `panelui.json` | Source-copied fork (not our default) | `@/components/ui/...` |
| Neither | Not set up — do not hand-write unstyled clones | Install per https://panelui.dev/docs/installation |

CLI (Bun): `bunx panelui-cli@latest list` / `add <name>` — only when forking a component into the repo. Day-to-day: import from the package.

## Principles

1. **Look before you build.** Search PanelUI (`bunx panelui-cli@latest list` or https://panelui.dev/llms.txt) before a custom sheet/picker/chart/chat.
2. **Compose the parts.** Settings → `Frame` + `Frame.Panel` + `Item`. Chat → `MessageScroller` + `Message`. Prefer compounds over raw `View`.
3. **Never hardcode a colour.** Tokens only: `bg-card`, `text-muted-foreground`, `border-border`. Literals break light/dark (and any future named theme).
4. **Read props from docs, not memory.** Fetch `https://panelui.dev/llms.mdx/components/<slug>` before first use in a session.
5. **Layout on `className`, look on variants.** `className` for width/flex/gap/margin; colours/type/radius via component variants.

## Critical rules (Kaplun)

### Styling

- Semantic tokens only — `bg-background` / `bg-card` / `text-foreground` / `text-muted-foreground` / `border-border` / `bg-primary`. **No** Clay tokens (`bg-canvas`, `text-ink`, `bg-surface-card`).
- **No `dark:` overrides** — tokens already switch; `dark:` is unreliable with named themes.
- **`gap-*`, never `space-y-*`** — RN has no `space-*`.
- **`cn()` from `@/tw/cn`** for conditional classes — not template-literal ternaries.
- Dynamic JS colour → `useCSSVariable('--color-foreground')`, never a copied hex.
- Full wrong/right pairs: upstream [rules/styling.md](https://github.com/panel-ui/PanelUI/blob/main/skills/panelui/rules/styling.md).

### Composition

- Exactly one `PanelUIProvider` at root (`src/app/_layout.tsx`). Overlays need its portal host.
- Compound parts stay under their root (`Card.Header` inside `Card`).
- Overlays: `open` + `onOpenChange` (or `defaultOpen`). Do not unmount to close — exit animation must finish.
- Forms: `Field` + `Label` + control — not a `View` with a `Text` above.
- Kaplun sheets: use **`@/components/ui/bottomsheet`**, not PanelUI `BottomSheet`, unless migrating that kit on purpose.

### Animation

- Reanimated 4 only — no RN core `Animated` for new motion.
- Import via `@/lib/reanimated-platform` or `@/tw/animated` (+ `.web.tsx` when the component uses worklets).
- `tv()` at module scope, never inside render.

### Primitives

```tsx
import { Button, Card, Text, Avatar } from 'panelui-native';
import { View, Pressable, ScrollView, useCSSVariable } from '@/tw';
import { cn } from '@/tw/cn';
```

- Screens/components: **no** direct `react-native` imports for View/Text/Pressable/Image — use `@/tw` / `@/tw/image`.
- Allowed raw RN without exception listing: `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`, type-only imports. Everything else → `scripts/check-structure.mjs` EXCEPTIONS.

## Which component (common cases)

| Need | Use |
|---|---|
| Action | `Button` / `ButtonGroup` |
| Modal | `Dialog` |
| Kaplun sheet | `@/components/ui/bottomsheet` (+ `BottomSheetHeader`) |
| Anchored panel / menu | `Popover` / `Menu` |
| Pick from list | `Select` / `Combobox` |
| Text in | `Input`, `Textarea`, `OtpInput`, … |
| Form | `Form` + `Field` |
| List row / settings | `Item` / `Frame` + `Frame.Panel` |
| Metric / series | `Kpi`, `BarChart`, `LineChart`, … |
| Conversation | `MessageScroller` + `Message` (+ `Marker`) |
| Empty / loading | `EmptyState`, `Skeleton`, `Spinner` |
| Toast | `Toast` |
| Entrance motion | `@/components/ui/reveal` (PanelUI does not cover this) |
| Floating tabs | `@/components/tab-bar/TabBar` |

Full catalog: https://panelui.dev/llms.txt · upstream [components.md](https://github.com/panel-ui/PanelUI/blob/main/skills/panelui/components.md)

## Theme (Kaplun)

- Families available upstream: Panel / Moon / Grass × light/dark. **Kaplun ships Panel light + dark** with dark canvas forced to `#000000`.
- Profile toggle: `setThemePreference('light' | 'dark')` — writes AsyncStorage and `Uniwind.setTheme`. Do **not** drive UI off OS scheme (`resolveScheme` ignores it; web forced light).
- StatusBar / NavigationBar: drive from `useThemeMode().mode`, not `style="auto"`.
- Do not re-declare `@custom-variant dark` — override tokens inside the built-in `@variant dark` after importing `theme.css`.
- Named themes (`moon`, `grass`, …) need `extraThemes` in `metro.config.js` + full server restart — Kaplun does not use them today.

## Implementation sequence (any UI task)

1. **Find existing** — PanelUI component? Kaplun kit (TabBar/sheet/reveal)? Reuse before inventing.
2. **Fetch docs** — `llms.mdx` page for any component not used this session.
3. **Tokens first** — layout with semantic classes; no hex; no Clay names.
4. **Compose** — PanelUI compounds + `@/tw` layout shells; keep business logic in hooks.
5. **Theme pass** — works in dark AMOLED and light; chrome via `useCSSVariable`.
6. **Motion pass** — Reanimated bridge only; reduced-motion aware; `.web.tsx` if needed.
7. **Tests** — colocated `*.test.tsx`; check `jest.setup.ts` for existing PanelUI mocks before adding new ones.
8. **Structure** — `node scripts/check-structure.mjs` if imports/escape hatches changed.

## Docs & tools

```bash
# Component API (markdown)
# https://panelui.dev/llms.mdx/components/bottom-sheet
# https://panelui.dev/llms.mdx/charts/bar-chart
# https://panelui.dev/llms.txt

bunx panelui-cli@latest list
bunx panelui-cli@latest add <component>   # only when forking into the repo

bun run lint          # tsc --noEmit
npx jest --testPathPattern=<screen>
node scripts/check-structure.mjs
```

UX polish / accessibility / motion priorities (not component API): use sibling skill `ui-ux-pro-max`, then map output through this skill's tokens and components.

## Gotchas that bite

- Clay is **gone** — no `@/components/clay`, no `useThemeColors()`, no `bg-canvas` / `text-ink`.
- `useCSSVariable` API: Uniwind may return a string or tuple depending on call shape — match local call sites (`as string` casts in screens).
- PanelUI `Switch` may not spread `ViewProps` — wrap in `Pressable` for a11y labels when needed.
- Conditional-unmounting Dialog/Sheet kills exit animation and can drop the portal.
- Restyling a Button with `className="bg-blue-500"` fights variants and breaks themes — use `variant`.
- `@expo/ui` removed — do not reintroduce Host/SegmentedControl/community bottom-sheet.
- `AutomationDmPreview` hardcodes Instagram palette on purpose — leave it.
- Reanimated on web: metro stubs + `@/lib/reanimated-platform`; never direct import.

## Definition of done

- [ ] Uses `panelui-native` and/or `@/tw` — no new Clay / NativeWind / `@expo/ui`
- [ ] Colours are semantic tokens (or documented escape hatch)
- [ ] Dark AMOLED + light both look correct; no `dark:` class hacks
- [ ] Overlays under `PanelUIProvider` with `open`/`onOpenChange` (or Kaplun bottomsheet API)
- [ ] Reanimated only via platform bridge; web-safe if animated
- [ ] Colocated tests green (`npx jest`); mocks aligned with `jest.setup.ts`
- [ ] `tsc --noEmit` clean; structure check OK if import rules touched
