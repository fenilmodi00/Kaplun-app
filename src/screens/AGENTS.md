# src/screens/ — Screen Module Extraction Spec

Extraction target for wave-2/3: move screen bodies out of `src/app/` route files into `src/screens/` modules, leaving thin re-export routes behind. This doc defines the contract every extracted screen follows.

## ROUTE RE-EXPORT CONTRACT

After extraction, each changed route file in `src/app/` becomes a single line:

```typescript
export { default } from '@/screens/<path>';
```

This preserves the default-export import contract that 9 existing test suites rely on. Screens that need route params keep calling `useLocalSearchParams` internally. No prop drilling from the route file.

## SCREEN MODULE CONVENTIONS

- **Default export:** every screen module exports a default function: `export default function HomeScreen() {...}`. Route files re-export it as `export { default } from '@/screens/...'`.
- **Folder-per-non-trivial-screen:** `index.tsx` + colocated `components.tsx` / `hooks.ts` / `utils.ts` + `*.test.*`. Simple screens can be a single `index.tsx`.
- **`@/tw`-only styling:** use `@/tw` primitives with Tailwind `className`. Documented raw-RN exceptions (`StyleSheet.create()` + `useThemeColors()`) follow their moved files from `src/app/` into `src/screens/`. See `src/tw/AGENTS.md` for the escape-hatch list.
- **No test files under `src/app/`:** Expo Router scans the route directory; test files pollute the route tree. Colocate tests in `src/screens/<name>/`.

## ROUTE THINNESS

- **Hard cap: 150 non-empty lines** for any `src/app/**/*.tsx` route file.
- **Extraction target: 5 lines or fewer** for extracted routes (one-line re-export + imports).

## FOLDER STRUCTURE

```
src/screens/
├── home/
│   ├── index.tsx          # default export HomeScreen
│   ├── utils.ts           # pure helpers
│   ├── utils.test.ts      # colocated tests
│   └── components.tsx     # screen-private components
├── messages/
│   ├── index.tsx          # default export MessagesScreen
│   └── thread.tsx         # default export ThreadScreen
├── automate/
│   ├── index.tsx          # default export AutomationsScreen
│   ├── detail/
│   │   ├── index.tsx
│   │   ├── utils.ts
│   │   └── components.tsx
│   └── new/
│       ├── index.tsx
│       ├── hooks.ts
│       └── components.tsx
├── insights/
│   ├── index.tsx
│   ├── utils.ts
│   └── components.tsx
└── profile/
    ├── index.tsx
    └── utils.ts
```

## ANTI-PATTERNS

- **NO test files under `src/app/`** — Expo Router route pollution. Colocate tests in `src/screens/`.
- **NO screen body code in route files** — route files are re-exports only.
- **NO direct `react-native` imports in screens** — use `@/tw` primitives. Allowed set: `Platform`, `Dimensions`, `FlatList`, `KeyboardAvoidingView`. Documented exceptions follow moved files.
- **NO `StyleSheet.create()` in screens** — use Tailwind `className` via `@/tw`. Documented exceptions follow moved files.
- **NO `as any` / `@ts-ignore` / `@ts-expect-error`** — prefer `unknown` + type guards.
- **NO `tablesDB` imports outside `src/lib/repository.ts`** — all Appwrite queries go through typed repository functions.
