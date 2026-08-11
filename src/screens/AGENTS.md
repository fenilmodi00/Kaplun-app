# src/screens/ — Screen Modules

Target state for extracted screen bodies. Route files in `src/app/` become thin re-exports; the actual screen logic lives here. See `src/app/AGENTS.md` for the route tree and `src/tw/AGENTS.md` for styling primitives.

## ROUTE RE-EXPORT CONTRACT

After extraction, each changed route file in `src/app/` becomes a single line:

```typescript
export { default } from '@/screens/<path>';
```

This preserves the default-export import contract that 9 existing test suites rely on. Screens that need route params keep calling `useLocalSearchParams` internally, exactly as the route body does today. No prop drilling from the route file.

Route-to-screen mapping (target):

| Route file | Screen module |
|------------|---------------|
| `(tabs)/(home)/index.tsx` | `@/screens/home` |
| `(tabs)/(automate)/list.tsx` | `@/screens/automate` |
| `(tabs)/(automate)/new.tsx` | `@/screens/automate/new` |
| `(tabs)/(automate)/[automationId].tsx` | `@/screens/automate/detail` |
| `(tabs)/(messages)/threads.tsx` | `@/screens/messages` |
| `(tabs)/(messages)/[threadId].tsx` | `@/screens/messages/thread` |
| `(tabs)/(insights)/dashboard.tsx` | `@/screens/insights` |
| `(tabs)/(profile)/view.tsx` | `@/screens/profile` |

## SCREEN MODULE CONVENTIONS

- **Default export** — every screen module exports its screen as `export default function HomeScreen() {...}`. The route re-export relies on this.
- **Folder-per-non-trivial-screen** — `index.tsx` holds the screen; `components.tsx` / `hooks.ts` / `utils.ts` hold private helpers split out when the screen grows. Colocated `*.test.*` files sit beside the code they test.
- **Private helpers stay private** — formatters, sub-components, and hooks used by only one screen live in that screen's folder (`utils.ts`, `components.tsx`, `hooks.ts`), not in `src/components/` or `src/hooks/`. Promote to the shared layers only when a second consumer appears.
- **Params stay internal** — `useLocalSearchParams<{...}>()` is called inside the screen module, not the route file. The route file passes nothing.

## STYLING RULES

- **`@/tw` primitives only** — `View`, `Text`, `Pressable` from `@/tw` with Tailwind `className`. Full primitive list and `cn()` utilities in `src/tw/AGENTS.md`.
- **Raw-RN exceptions follow their files** — screens that use `StyleSheet.create()` today (`src/screens/automate/detail/index.tsx`, `src/screens/profile/index.tsx`) keep that exception. `src/tw/AGENTS.md` tracks the escape-hatch list under "Documented raw-RN escape hatches"; update both docs when a screen's regime changes.
- **Theme tokens, not hex** — colors via `className` tokens or `useThemeColors()` in raw-RN islands. See root `AGENTS.md` anti-patterns.
- **Reanimated via `@/lib/reanimated-platform` or `@/tw/animated` only** — see root `AGENTS.md`.

## ROUTE THINNESS

- **≤150 non-empty lines** hard cap for any `src/app/**/*.tsx` route file.
- **≤5 lines** target for extracted routes — the one-line re-export plus imports if needed.
- **No test files under `src/app/`** — Expo Router treats every file as a route. Colocated tests live in `src/screens/` beside their screen module.

## FOLDER STRUCTURE

```
src/screens/
├── home/
│   ├── index.tsx          # default export HomeScreen
│   ├── utils.ts            # pure helpers
│   ├── utils.test.ts       # colocated tests
│   └── components.tsx       # private sub-components
├── messages/
│   ├── index.tsx           # default export MessagesScreen
│   └── thread.tsx          # default export ThreadScreen
├── automate/
│   ├── index.tsx           # default export AutomationsScreen
│   ├── detail/
│   │   ├── index.tsx       # default export AutomationDetailScreen
│   │   ├── utils.ts
│   │   ├── utils.test.ts
│   │   └── components.tsx
│   └── new/
│       ├── index.tsx       # default export AutomationNewScreen
│       ├── hooks.ts
│       └── components.tsx
├── insights/
│   ├── index.tsx           # default export InsightsScreen
│   ├── utils.ts
│   ├── utils.test.ts
│   └── components.tsx
└── profile/
    ├── index.tsx           # default export ProfileScreen
    ├── utils.ts
    └── utils.test.ts
```

## GOTCHAS

- The `as never` cast for profile navigation stays in the route file, not the screen.
- `validateAutomationDraft` in the new-automation screen stays as-is (already from `@/lib/automation-validation`).
