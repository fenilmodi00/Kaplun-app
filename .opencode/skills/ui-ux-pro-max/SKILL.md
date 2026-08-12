---
name: ui-ux-pro-max
description: "UI/UX design intelligence for the Kaplun Expo React Native app (Expo SDK 57, RN 0.86, PanelUI + Uniwind + Tailwind v4, Reanimated 4.5). Use when designing, reviewing, or polishing screens for accessibility, touch, layout, typography, motion, or visual quality. For component API and token rules, also apply the panelui skill. Triggers: UI, UX, design, redesign, styling, layout, animation, motion, interaction, make it pretty, screen, polish, a11y, theme."
---

# UI/UX Pro Max — Kaplun Edition

Searchable UI/UX design guidance for Kaplun. Visual **implementation** (PanelUI components, Uniwind tokens, `@/tw`) lives in the sibling **`panelui`** skill — use that for what to import and how to style. This skill ranks **product/UX quality** and maps search output onto that stack.

## When to Apply

Use when the task involves **UI structure, visual design, interaction, motion, or UX QC**:

- Designing or refactoring a screen's information architecture or interaction
- Choosing layout density, hierarchy, motion, or accessibility fixes
- Reviewing polish ("feels off", "not native", contrast, tap targets)
- Building flows (auth, onboarding, automate, messages, insights)

Skip for pure backend / API / non-visual work. For "add a BottomSheet / Button / chart", start with **`panelui`**.

## Kaplun Stack Mapping

Before changing UI, read in this order:

| What you need | Read first | Why |
|---|---|---|
| Component + token rules | `.opencode/skills/panelui/SKILL.md` | PanelUI package, semantic tokens, AMOLED |
| Token / kit map | `.opencode/skills/panelui/kaplun-stack.md` | Class names, kept custom components |
| CSS entry | `src/global.css` | Uniwind + PanelUI theme + AMOLED `#000000` |
| Primitives | `src/tw/AGENTS.md` | `@/tw`, `cn()`, escape hatches |
| Custom chrome | `src/components/AGENTS.md` | TabBar, bottomsheet, reveal |
| Animation bridge | `src/lib/reanimated-platform.ts` | Required instead of direct Reanimated |
| Navigation | `src/app/(tabs)/` | 4 tabs + hidden profile |
| Fonts | `src/lib/fonts.ts` | Inter via `useClayFonts()` name (fonts only) |

### Stack pieces you MUST prefer

- **Components**: `panelui-native` first. Then Kaplun kits (TabBar, `@/components/ui/bottomsheet`, reveal).
- **Primitives**: `@/tw` (`View`, `Text`, `Pressable`, …). Not raw `react-native` in screens.
- **Colour**: PanelUI semantic tokens (`bg-background`, `text-foreground`, `bg-card`, …). No Clay names, no hex (except documented IG preview).
- **Animation**: `@/lib/reanimated-platform` or `@/tw/animated`. Never `react-native-reanimated` direct.
- **Theme**: `setThemePreference` / `useThemeMode` — dark default, OS scheme ignored.

## Priority Rules (1 → 10)

Full rationale: `references/quick-reference.md`. Pre-delivery checklist: `references/pro-rules.md`.

| Priority | Category | Impact | Key Checks | Anti-patterns |
|---|---|---|---|---|
| 1 | Accessibility | CRITICAL | Contrast ≥ 4.5:1, labels on icon-only, reduced motion | Removing focus affordances |
| 2 | Touch & Interaction | CRITICAL | ≥ 44×44 pt, 8 pt gaps, pressed feedback | Hover-only, no press state |
| 3 | Performance | HIGH | Virtualize lists, reserve async space, animate transform/opacity | Animating width/height |
| 4 | Style Selection | HIGH | PanelUI tokens + variants, consistent icons | Mixing systems, raw hex |
| 5 | Layout & Responsive | HIGH | Mobile-first, safe areas, tab-bar clearance | Fixed px widths, content under tab bar |
| 6 | Typography & Color | MEDIUM | ≥ 14–16 px body, semantic colours | Gray-on-gray, hardcoded colours |
| 7 | Animation | MEDIUM | 150–300 ms, Reanimated bridge, reduced motion | Decorative-only layout animation |
| 8 | Forms & Feedback | MEDIUM | Visible labels, inline errors, empty/loading states | Placeholder-only labels |
| 9 | Navigation | HIGH | Predictable back, ≤ 4 bottom tabs, deep links | Broken back, overloaded nav |
| 10 | Charts & Data | LOW | Legends, accessible colours, text summary | Colour-only meaning |

## Running the Search Tool

```bash
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --domain <domain> [-n <max_results>]
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --stack react-native
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system -p "Kaplun"
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "<query>" --design-system --persist -p "Kaplun" --output-dir "."
```

If `python` fails, try `python3` or `py -3`.

**Prefer for Kaplun:** `--stack react-native`, `--domain ux`, `--domain expo`, `--domain product`, `--domain style` / `color` / `typography` (map fonts to Inter — ignore Google Fonts URLs). Treat `--domain nativewind` hits as **Uniwind-compatible** className guidance; implement via `@/tw` + PanelUI tokens, not NativeWind APIs.

## Workflow

### 1. Analyze

- **Flow**: home / automate / messages / insights / profile / auth
- **Audience**: Instagram creators on mobile
- **Style**: PanelUI semantic surfaces, AMOLED dark default, Inter
- **Stack**: Expo 57, RN 0.86, PanelUI, Uniwind, Reanimated 4.5

### 2. Read the system

1. `.opencode/skills/panelui/SKILL.md` + `kaplun-stack.md`
2. `src/global.css`
3. Nearby screen under `src/screens/` for composition patterns
4. Optional: `design-system/kaplun/MASTER.md` if present

### 3. Design-system search (net-new / redesign)

```bash
python ".opencode/skills/ui-ux-pro-max/scripts/search.py" "instagram creator saas mobile app minimal panel" --design-system -p "Kaplun" --output-dir "."
```

Map recommendations through **`panelui`** — not Clay.

### 4. Map output → code

```tsx
import { Button, Card, Text } from 'panelui-native';
import { View, ScrollView } from '@/tw';
import { cn } from '@/tw/cn';

<View className="flex-1 bg-background px-4 pt-safe">
  <Text className="text-foreground text-lg font-semibold">Title</Text>
  <Card className="mt-4 gap-3 p-4">
    <Button variant="primary" className="w-full" onPress={onSave}>
      Save
    </Button>
  </Card>
</View>
```

### 5. Pre-delivery (minimum)

- [ ] PanelUI / Kaplun kits — no Clay / `@expo/ui`
- [ ] Semantic tokens only; dark + light checked
- [ ] Tap targets ≥ 44×44; tab-bar / safe-area clearance
- [ ] Pressed/disabled states; reduced motion respected
- [ ] `accessibilityLabel` on icon-only controls
- [ ] Motion via Reanimated bridge, transform/opacity, 150–300 ms

## Stack-specific notes

### React Native / Expo

- `Pressable` over `TouchableOpacity` for custom feedback
- Virtualize 50+ lists; don't fight nested scroll
- Don't block iOS swipe-back / Android predictive back

### Uniwind + Tailwind v4

- `gap-*` not `space-y-*`
- No `dark:` overrides — use tokens
- `cn()` for conditionals
- Colour on `Text` / inputs, not parent `View` (no cascade)
- Arbitrary values sparingly (`mt-[13px]` is a smell)

### Reanimated

- `@/lib/reanimated-platform` / `@/tw/animated` only
- `.web.tsx` when using worklets
- Support reduced motion

## If unclear

1. Re-read `panelui` skill + `src/global.css` + the nearest migrated screen
2. Re-read `references/quick-reference.md`
3. Say when a recommendation is a general default, not a project match

## References

- `.opencode/skills/panelui/SKILL.md` — component/token/theme rules
- `.opencode/skills/panelui/kaplun-stack.md` — file map
- `references/quick-reference.md` — priority index
- `references/pro-rules.md` — polish checklist
- `references/kaplun-stack.md` — legacy detail (prefer panelui kaplun-stack)
