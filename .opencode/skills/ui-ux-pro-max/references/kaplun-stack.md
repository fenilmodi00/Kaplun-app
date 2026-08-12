# Kaplun Stack Implementation Guide

> **Canonical map:** `.opencode/skills/panelui/kaplun-stack.md`  
> This file remains for search-tool workflow links; prefer the panelui copy.

## Where Design Tokens Live

`src/global.css`: `@import 'uniwind'` + `@import 'panelui-native/theme.css'`, then Kaplun overrides:

- `@variant dark { --color-background: #000000 }` (AMOLED)
- Inter `--font-sans` / `--font-display`

### Colour tokens (PanelUI)

| Role | Class examples |
|---|---|
| Canvas | `bg-background` |
| Text | `text-foreground`, `text-muted-foreground` |
| Surfaces | `bg-card`, `bg-muted`, `bg-secondary` |
| Borders | `border-border` |
| Primary | `bg-primary`, `text-primary-foreground` |
| Status | `text-destructive`, `text-success`, `text-warning` |
| Charts | `bg-chart-1` … `chart-5` |

**Do not use Clay names:** `bg-canvas`, `text-ink`, `bg-surface-card`, brand-* feature tokens, `useThemeColors()`.

## Primitives

```tsx
import { View, Text, Pressable, ScrollView, useCSSVariable } from '@/tw';
import { cn } from '@/tw/cn';
import { Image } from '@/tw/image';
import { Button, Card } from 'panelui-native';
```

Animation: `@/lib/reanimated-platform` or `@/tw/animated` — never direct `react-native-reanimated`.

## Components

1. **`panelui-native`** — primary library (Button, Card, Item, Dialog, charts, Message*, …)
2. **Kaplun kits** — TabBar, `@/components/ui/bottomsheet`, `reveal`, `screen-shell`
3. **Icons** — `SymbolIcon` for tab chrome; PanelUI components carry their own icons where applicable

## Layout

- Safe areas: `pt-safe` / `pb-safe` + `TAB_BAR_OVERLAY` from `screen-shell`
- Theme: `setThemePreference` + `Uniwind.setTheme`; OS scheme ignored; web light
- Sheets: Kaplun bottomsheet kit unless explicitly migrating to PanelUI `BottomSheet`

## Anti-patterns

- NativeWind / `useCssElement` / Clay imports
- `dark:` class overrides for theme
- `space-y-*`
- Hex colours in product UI (except AutomationDmPreview IG palette)
- `@expo/ui`
