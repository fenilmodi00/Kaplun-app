# PROJECT KNOWLEDGE BASE — app/

**Generated:** 2026-07-21
**Commit:** d7f4bf6
**Branch:** main

> Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## OVERVIEW

Expo SDK 54 mobile app ("creator-workspace") for Instagram creators. Clerk auth → Appwrite TablesDB (direct CRUD + Realtime) + FastAPI backend (Instagram proxy). Clay design system. expo-router file-based routing. Bun (not npm).

## STRUCTURE

```
app/
├── src/
│   ├── app/                    # expo-router: _layout (Clerk+AuthGate) → (tabs)/(home|messages|profile)
│   ├── components/
│   │   ├── auth/AuthScreen.tsx # 814 LOC — email+OTP+Google OAuth, raw StyleSheet (NOT @/tw)
│   │   └── clay/               # 8 Clay design components (.web.tsx variants for Reanimated safety)
│   ├── hooks/                  # 6 hooks: data layer (Appwrite direct + FastAPI for IG)
│   ├── lib/                    # 13 infra files: appwrite, auth-bridge, instagram, realtime, web stubs
│   ├── tw/                     # 5 styling primitives: className-enabled RN wrappers via react-native-css
│   ├── types/global.d.ts       # ErrorUtils, Buffer, __lastFatalError augmentations
│   └── __tests__/              # 6 jest-expo test files
├── global.css → src/global.css # Tailwind v4 @theme (Clay tokens, platform fonts)
├── app.json                    # scheme "kaplun", 5 plugins (expo-secure-store first)
├── metro.config.js             # NativeWind + reanimated/worklets web stubs (#8285)
└── jest.setup.ts               # 266-line global mock suite
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Add a screen | `src/app/(tabs)/<group>/` | expo-router file-based; each group has `_layout.tsx` (Stack) + `index.tsx` |
| Add a Clay component | `src/components/clay/` | See `src/components/clay/AGENTS.md` — decide `@/tw` vs raw RN |
| Add a data hook | `src/hooks/` | See `src/hooks/AGENTS.md` — Appwrite direct for CRUD, FastAPI for IG |
| Add infra (Appwrite/FastAPI/realtime) | `src/lib/` | See `src/lib/AGENTS.md` |
| Add a styled primitive | `src/tw/` | See `src/tw/AGENTS.md` |
| Change a Clay color/token | `src/global.css` `@theme` | Some hex values duplicated in raw-RN components (ClayAnimatedButton, ClaySpinner, AuthScreen) — update both |
| Add a backend (FastAPI) call | `src/lib/instagram.ts` | JWT Bearer header via `getAuthHeaders()`; 15s `AbortController` timeout |
| Add an Appwrite table call | `src/hooks/` via `tablesDB` from `@/lib/appwrite` | `DATABASE_ID` + `TABLES` enum from `@/lib/constants` |
| Add realtime subscription | `useRealtimeSubscription` from `@/lib/realtime` | `Channel.tablesdb(DATABASE_ID).table(TABLES.X).row()` |
| Add a test | `src/__tests__/*.test.tsx` | jest-expo; global mocks in `jest.setup.ts`; per-file `jest.mock()` for hooks |
| Fix Reanimated web crash | `metro.config.js` + `src/lib/reanimated-web-stub.js` | Issue #8285; Metro aliases reanimated/worklets on web |
| Change env vars | `.env` (gitignored) + `.env.example` | `EXPO_PUBLIC_*` prefix for client-visible vars |
| Debug startup crash | `src/lib/logger.tsx` → `SplashLogger` | In-memory ring buffer; renders on-screen if fatal |

## CODE MAP

| Symbol | Type | Location | Role |
|--------|------|----------|------|
| `RootLayout` | func | `src/app/_layout.tsx:98` | Boot: SafeAreaProvider → ClerkProvider → AuthGate → Slot |
| `AuthGate` | func | `src/app/_layout.tsx:44` | Auth guard: ClaySpinner (loading) / AuthScreen (unauth) / Slot (auth); calls `createAppwriteSession` on sign-in |
| `AuthScreen` | func | `src/components/auth/AuthScreen.tsx:321` | 814 LOC, 5 inline sub-components; Clerk email+OTP+Google OAuth via `useAuthFlow` |
| `createAppwriteSession` | func | `src/lib/auth-bridge.ts:11` | Clerk JWT → FastAPI `/auth/appwrite-session` → `account.createSession()` |
| `tablesDB` | const | `src/lib/appwrite.ts:9` | Appwrite `TablesDB` singleton (NOT `Databases`); all CRUD goes through this |
| `useRealtimeSubscription` | hook | `src/lib/realtime.ts:7` | Appwrite Realtime; ref-based callback, cleanup on unmount |
| `loginInstagram` / `fetchMedia` / `fetchInsights` | func | `src/lib/instagram.ts` | FastAPI client; `Authorization: Bearer ${clerkToken}`; 401 → `'session_expired'` |
| `useDashboard` | hook | `src/hooks/useDashboard.ts:21` | Appwrite: creator + threads + deals |
| `useThreads` | hook | `src/hooks/useThreads.ts:20` | Appwrite: threads + last-message preview + Realtime |
| `useMessages` | hook | `src/hooks/useMessages.ts:17` | Appwrite: messages CRUD + Realtime; `sendMessage`, `markAsRead` |
| `useCreatorProfile` | hook | `src/hooks/useCreatorProfile.ts:31` | Hybrid: Appwrite (creator/threads/posts) + FastAPI (media/insights) |
| `useAuthFlow` | hook | `src/hooks/useAuthFlow.ts` | Clerk state machine: signIn/signUp/OTP/Google; uses `__internal_future` API |
| `useClayAnimations` | hook | `src/hooks/useClayAnimations.ts` | `usePressAnimation`, `useShakeAnimation`, `useEntranceAnimation` (Reanimated) |
| `ClayTabBar` | func | `src/components/clay/ClayTabBar.tsx:18` | Custom bottom tab bar (3 tabs), animated sliding indicator |
| `secureTokenCache` | const | `src/lib/tokenCache.ts:9` | Clerk `TokenCache` via `expo-secure-store`; silent fallback on web |
| `useClayFonts` | hook | `src/lib/fonts.ts:13` | Loads Inter 400/500/600; gates render in AuthGate |
| `DATABASE_ID` / `TABLES` | const | `src/lib/constants.ts:1` | `'vernacular_saas'` + enum: CREATORS, POSTS, DEAL_THREADS, MESSAGES, DEALS |

## CONVENTIONS

- **Stack**: NativeWind v5 + Tailwind CSS v4 + react-native-css (no Tamagui). No `tailwind.config.*` — Tailwind v4 uses CSS-based `@theme` in `src/global.css`.
- **Primitives**: `View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `TouchableHighlight`, `Link` from `@/tw` (not `react-native` directly) so `className` works via `useCssElement`.
- **Helpers**: `cn()` from `@/tw/cn` (clsx + tailwind-merge); `AnimatedView` from `@/tw/animated`; `Image` from `@/tw/image`. Compound utilities: `clayInput`, `clayCard`, `clayFeatureCardBase`, `clayButtonBase` in `src/tw/cn.ts`.
- **Data**: Appwrite TablesDB direct (no React Query/SWR). Hooks use `useState`/`useEffect` + manual `refresh` callback. `cancelledRef` for unmount safety.
- **Auth**: Clerk JWT → FastAPI `/auth/appwrite-session` → Appwrite session (once, on sign-in). Every FastAPI call attaches `Authorization: Bearer ${clerkToken}`.
- **Errors from FastAPI**: 401 → throw `'session_expired'` (string literal — hooks check `err.message === 'session_expired'`).
- **Fonts**: Inter 400/500/600 via `@expo-google-fonts/inter`; loaded at boot via `useClayFonts()`; gates render in `AuthGate`.
- **Reanimated**: Import from `@/lib/reanimated-platform` (NOT `react-native-reanimated` directly) — provides web fallbacks for #8285. Metro also aliases to stubs on web.
- **`.web.tsx` variants**: Components using Reanimated have a `.web.tsx` variant (ClaySpinner, ClayAnimatedButton, `@/tw/animated`) — Metro resolves on web.
- **Path alias**: `@/*` → `./src/*` (tsconfig + jest `moduleNameMapper`).
- **Tests**: jest-expo; `await render(<Component />)` (React 19 concurrent); `.toBeTruthy()` assertions; state-based testing (loading/error/empty/data via `defaultMockReturn` spread); no MSW, no shared test-utils.
- **Package manager**: Bun (`bun.lock`, not `package-lock.json`).
- **No ESLint/Prettier/Biome**: lint = `tsc --noEmit` only.

## ANTI-PATTERNS (THIS PROJECT)

- **NO direct `react-native` imports in screens/components** — use `@/tw` primitives so `className` works. Exceptions: `@/tw/*` wrapper files themselves; `Platform`/`Dimensions`/`FlatList`/`KeyboardAvoidingView` (no `@/tw` equivalents). Currently violated in AuthScreen + some Clay components (raw StyleSheet for Android layout-bug avoidance).
- **NO `StyleSheet.create()` in screens** — use Tailwind `className`. Exceptions: `@/tw/index.tsx` internals; components that explicitly avoid NativeWind for Android layout stability (ClayAnimatedButton, ClaySpinner, AuthScreen — documented in their own comments).
- **NO bare `catch {}`** — always name the error (`catch (err)` or `catch (err: unknown)`). Parent monorepo rule: "NO bare `except:`".
- **NO `as any`** — prefer `unknown` + type guards. `as any` defeats `strict: true` in tsconfig.
- **NO `console.log`/`console.warn` in production code** — use `addLog()` from `@/lib/logger`. Exception: `@/lib/logger.tsx` itself (Metro bridge).
- **NO direct `react-native-reanimated` imports** — use `@/lib/reanimated-platform` (web-safe). Currently violated in 10 files — see `src/components/clay/AGENTS.md`.
- **NO hardcoded secrets** — all credentials in `.env` as `EXPO_PUBLIC_*` vars, read via `process.env.EXPO_PUBLIC_*`.
- **NO direct instagrapi/Instagram API calls** — app talks to FastAPI (`api/`) only; `SessionManager` holds IG sessions server-side.
- **NO `@ts-ignore` / `@ts-expect-error`** — zero instances currently; keep it that way.

## UNIQUE STYLES

- **Clay design system** — `src/components/clay/` (8 files) implements the Clay visual language: cream canvas `#fffaf0`, saturated single-color feature cards (pink/teal/lavender/peach/ochre), dark-navy CTAs, Inter display type, claymation-style press animations. Design tokens in `src/global.css` `@theme`; fonts in `src/lib/fonts.ts` (`CLAY_FONTS`). Components split: `@/tw`-based (Tailwind classes) vs raw-RN (StyleSheet + hardcoded hex to avoid NativeWind Android layout bugs). See `src/components/clay/AGENTS.md`.
- **`useCssElement` bridge** — `@/tw` primitives wrap RN components with `react-native-css`'s `useCssElement(Comp, props, { className: 'style' })` to map `className` → `style`. Not standard NativeWind `styled()`.
- **Dual Reanimated web strategy** — Metro aliases (`reanimated-web-stub.js` + `worklets-web-stub.js`) AND `reanimated-platform.ts` (Platform conditional). Belt-and-suspenders for #8285.
- **AuthGate as component, not route** — `AuthGate` in `_layout.tsx` conditionally renders `<AuthScreen />` vs `<Slot />`; not a separate expo-router route.
- **Startup crash logger** — `polyfills.ts` + `logger.tsx` capture errors before UI renders; `SplashLogger` renders them on-screen.

## COMMANDS

```bash
bun install              # install deps
bun start                # expo dev server
bun start --android      # dev + Android
bun start --ios          # dev + iOS
bun start --web          # dev + web
bun test                 # jest-expo
bun run lint             # tsc --noEmit
```

No EAS, no CI, no `eas.json`, no `.github/workflows/`. Only dev commands work. Production build requires creating EAS config first.

## NOTES

- **3-system architecture**: App → Appwrite TablesDB (direct CRUD + Realtime for creators/deal_threads/messages/deals/posts); App → FastAPI → instagrapi → Instagram (login/profile/media/insights); App → FastAPI → Appwrite (auth bridge only). The FastAPI backend (`D:\001\api`) never proxies Appwrite data — only creates sessions + proxies IG. See `D:\001\api\AGENTS.md` for the backend's route table.
- **Env vars (app)**: `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` (`_layout.tsx:17`), `EXPO_PUBLIC_APPWRITE_ENDPOINT` (`lib/appwrite.ts:5`), `EXPO_PUBLIC_APPWRITE_PROJECT_ID` (`lib/appwrite.ts:6`), `EXPO_PUBLIC_IG_API_BASE_URL` (`lib/instagram.ts:14` + `lib/auth-bridge.ts:3`).
- **SDK version**: Expo SDK **54** (`package.json:21`: `"expo": "~54.0.35"`). The root `D:\001\AGENTS.md` incorrectly says "SDK 57" — stale.
- **No Tamagui**: Root `D:\001\AGENTS.md` says "Tamagui" — stale. This app uses NativeWind v5 + Tailwind v4 + react-native-css. Zero Tamagui references.
- **Screens are NOT placeholders**: Root `D:\001\AGENTS.md` says "placeholders in (tabs)/(messages), (tabs)/(profile)" — stale. All 3 screens + thread detail are fully built (Home: 281 LOC, Messages: 183 LOC, ThreadDetail: 262 LOC, Profile: 301 LOC).
- **`dist/` committed**: Web export output is checked into git (not gitignored).
- **`expo-secure-store` first in plugins**: Unusual order (typically `expo-router` first) — see `app.json:32-38`.
- **`lightningcss` pinned**: `"lightningcss": "1.30.1"` in `package.json` resolutions (NativeWind v5 compat).

<!-- BEGIN opencode-rag -->
## Code Navigation

ALWAYS use OpenCodeRAG tools before reading or editing:
- **Search first** — `search_semantic(query)` instead of grep/glob
- **Skeleton before read** — `get_file_skeleton(filePath)` then read specific lines
- **Usages before edit** — `find_usages(symbolName)` before modifying any symbol
- **Images via describe** — `describe_image(filePath)` — never read raw bytes

If no results, run `opencode-rag index`.
<!-- END opencode-rag -->

## Subdirectory Guides

- `src/lib/AGENTS.md` — infrastructure layer (Appwrite, auth-bridge, FastAPI client, realtime, web stubs)
- `src/hooks/AGENTS.md` — data layer (6 hooks, Appwrite-vs-FastAPI split)
- `src/components/clay/AGENTS.md` — Clay design system (8 components, `.web.tsx` variants)
- `src/tw/AGENTS.md` — styling primitives (className-enabled RN wrappers)
