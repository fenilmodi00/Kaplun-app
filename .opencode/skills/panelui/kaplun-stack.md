# Kaplun stack map — PanelUI + Uniwind

Read alongside `SKILL.md` and `src/global.css`.

## Tokens (PanelUI semantic)

| Role | Token / class | Notes |
|---|---|---|
| Canvas | `--color-background` → `bg-background` | Dark overridden to `#000000` |
| Text | `--color-foreground` → `text-foreground` | |
| Muted text | `--color-muted-foreground` → `text-muted-foreground` | |
| Card surface | `--color-card` / `text-card-foreground` | |
| Border | `--color-border` → `border-border` | |
| Primary action | `--color-primary` / `text-primary-foreground` | |
| Muted / accent / destructive / success / warning | matching `--color-*` | Prefer component variants |
| Charts | `--color-chart-1` … `chart-5` | |

**Dead Clay names (do not use):** `bg-canvas`, `text-ink`, `bg-surface-card`, `bg-primary-active`, brand-* feature cards, `useThemeColors()`.

## CSS entry (`src/global.css`)

```
@import uniwind
@import panelui-native/theme.css
@source '../node_modules/panelui-native/src'
@variant dark { --color-background: #000000 }
Inter via --font-sans / --font-display (+ ios/android variants)
```

## Theme persistence

| API | Where | Behavior |
|---|---|---|
| `hydrateThemePreference()` | boot in `_layout` | AsyncStorage → `Uniwind.setTheme` (default `dark`) |
| `setThemePreference(next)` | profile toggle | store + `Uniwind.setTheme` |
| `useThemeMode()` | PanelUI | `mode` for StatusBar / scheme-derived UI |
| `useThemeScheme()` | `@/lib/theme` | web → always `light`; else `useThemeMode().mode` |
| `resolveScheme` | `@/lib/theme` | **ignores OS** — explicit preference only |

## `@/tw` primitives

| Import | Use |
|---|---|
| `@/tw` | `View`, `Text`, `Pressable`, `ScrollView`, `TextInput`, `Link`, `useCSSVariable` |
| `@/tw/cn` | `cn()`, `sheetContent` |
| `@/tw/image` | `Image` |
| `@/tw/animated` | `AnimatedView`, `useShakeAnimation` (+ `.web.tsx`) |

## Kept Kaplun components (not PanelUI)

| Component | Path | Why kept |
|---|---|---|
| Floating TabBar | `src/components/tab-bar/TabBar.tsx` | Product chrome; Uniwind className |
| Bottom sheet kit | `src/components/ui/bottomsheet/` | Imperative present/dismiss + blur backdrop |
| Reveal | `src/components/ui/reveal.tsx` | Entrance/pop — no PanelUI equivalent |
| Screen shell | `src/components/screen-shell.tsx` | Tab-bar clearance |
| Auth screen | `src/components/auth/AuthScreen.tsx` | Large flow; PanelUI fields inside |
| IG DM preview | `src/components/automation/AutomationDmPreview.tsx` | Instagram palette by design |

## Screen → PanelUI (post-migration)

Prefer matching nearby screens: Home (Button/Avatar/Card/Skeleton), Insights (Kpi/BarChart/Chip), Messages (Item/MessageScroller/Message), Automate (Item/Switch/Dialog/Input/Textarea), Profile (Card/Switch theme), Score (Kpi/Card), Auth (Input/OtpInput/Button).

## Escape hatches

Listed in `scripts/check-structure.mjs` and `src/tw/AGENTS.md`. Do not add new `StyleSheet.create` / raw RN without updating that list and a one-line reason.
