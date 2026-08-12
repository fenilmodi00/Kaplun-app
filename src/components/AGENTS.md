# src/components/ — Non-Clay Components

Scope: the `ui/` kit (bottomsheet, reveal), `auth/`, `automation/`, `tab-bar/`, and root-level components. PanelUI (`panelui-native`) is the primary component library.

## STRUCTURE

| Path | Role |
|------|------|
| `ui/` (bottomsheet + reveal) | Custom bottom sheet (`bottomsheet/index.tsx`, `header.tsx`, `backdrop.tsx`) and entrance/pop animation (`reveal.tsx`). Import `@/components/ui/bottomsheet` and `@/components/ui/reveal`. |
| `ui/bottomsheet/` | Native modal bottom sheet (`index.tsx`, `header.tsx`, `backdrop.tsx`). Import `@/components/ui/bottomsheet` only — not `@expo/ui` directly. |
| `auth/AuthScreen.tsx` | Login/signup OTP screen, 761 lines. Internal pieces: `CapsuleToggle`, `EmailField`, `PasswordInput`, `OTPInput`, `AuthShell`. Raw-RN StyleSheet exception |
| `automation/AutomationDmPreview.tsx` | Simulated IG DM inbox preview for the automation builder; `{username}` substitution; hardcoded IG colors by design |
| `edge-blur.tsx` | (DELETED — replaced by inline `LinearGradient` in TabBar and `(tabs)/_layout.tsx`) |
| `screen-shell.tsx` | Screen padding shell; exports `TAB_BAR_OVERLAY` used with `useSafeAreaInsets` so content clears the floating tab bar |
| `symbol-icon.tsx` | SF Symbol wrapper used by the tab bar |
| `ui/error-state.tsx` | Shared error state: centered message + optional Retry button with mount-time shake. Consolidates per-screen private copies |

## FOLDER RULE — multi-file kits inside `ui/`

**New multi-file component families live in `src/components/ui/<name>/`**, not as loose files crowding `ui/` root.

| Put at `ui/<file>.tsx` | Put in `ui/<name>/` |
|------------------------|---------------------|
| Single-file primitives (input, switch, badge) | 2+ related files (main + header + backdrop + tests) |
| Stateless form/display atoms | Composite kits with re-exports |

- Folder name: kebab-case (`bottomsheet/`, not `BottomSheet/`).
- Public import: `@/components/ui/<name>` via `index.tsx` barrel.
- Colocate tests beside the barrel (`index.test.tsx`).

## NAMING CONVENTIONS

| Directory | Convention | Examples |
|-----------|-----------|----------|
| `ui/` | kebab-case | `toggle-card.tsx`, `error-state.tsx`, `glass-surface.tsx` |
| `ui/<kit>/` | kebab-case files | `bottomsheet/index.tsx`, `header.tsx`, `backdrop.tsx` |
| `tab-bar/` | PascalCase | `TabBar.tsx` |
| `auth/` | PascalCase | `AuthScreen.tsx` |
| `automation/` | PascalCase | `AutomationDmPreview.tsx` |
| `tab-bar/` | Floating tab bar (moved from `clay/` in Phase 3) |
| root-level | kebab-case | `screen-shell.tsx`, `symbol-icon.tsx` |

Existing files are grandfathered. New files must follow the convention for their directory.

## `ui/` KIT CONVENTIONS

- **className via `@/tw` + `cn()`** — variant/size maps are `Record<Type, string>` of Tailwind class strings.
- **Compound components via context** — `Input`/`Textarea` provide variant+size+state to their field children; `RadioGroup` → `Radio` → `RadioIndicator`/`RadioLabel` throw outside the provider.
- **`forwardRef` only on field inputs** — `InputField`/`TextareaInput` expose imperative `focus`/`blur`/`clear`/`setText`.
- **StyleSheet exception is font-metric driven** — `input.tsx`/`textarea.tsx` use `StyleSheet.create()` because Tailwind typography tokens balloon line-height on Android. This is intentional, not debt.
- **Theming** — raw-RN pieces read `useCSSVariable('--color-*')` from `@/tw`; PanelUI components theme automatically via `PanelUIProvider`.
- **Reanimated only via `@/lib/reanimated-platform`** — `collapsible.tsx`/`reveal.tsx` guard web with `IS_REANIMATED_AVAILABLE` (web inits at final state).
- **Accessibility** — `accessibilityRole`/`accessibilityState`/`accessibilityLabel`/`testID` throughout (see `radio.tsx` for the pattern).
- **`glass-surface.tsx`** — (DELETED — replaced by inline `LiquidGlassView`/`BlurView` in `TabBar.tsx`).

## `ui/bottomsheet/` CONVENTIONS

- **Import path:** `@/components/ui/bottomsheet` only. Never `@expo/ui/community/bottom-sheet` from screens.
- **Native-only** (iOS/Android dev client). No `.web.tsx` variant.
- **Panel:** solid `canvas` background (AMOLED `#000000` dark, cream light) — not glass/blur on the sheet itself.
- **Backdrop:** blurred + dimmed scrim via `@sbaiahmed1/react-native-blur` when open (Expo ignores `backdropComponent` on native).
- **Re-exports:** scroll helpers, `useBottomSheet`, types. `sheetContent` padding utility lives in `@/tw/cn`.
- **Companion:** `BottomSheetHeader` for title/subtitle/close row.

## GOTCHAS

- `AuthScreen.tsx` is a documented raw-RN exception and a large-file hotspot — prefer targeted edits.
- `AutomationDmPreview` intentionally hardcodes IG's own palette (`#000000`, `#5B51D8`→`#C13584`) — it simulates Instagram's UI, not Kaplun's; do not migrate it to theme tokens.
