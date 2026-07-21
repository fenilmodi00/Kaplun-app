# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

## Stack

- **Styling**: NativeWind v5 + Tailwind CSS v4 + react-native-css (no Tamagui)
- **Theme/config**: `src/global.css` (Tailwind theme, platform fonts, CSS variables)
- **Primitives**: `src/tw/` — use `View`, `Text`, `ScrollView`, `Pressable`, `TextInput`, `TouchableHighlight`, `Link` from `@/tw` (not react-native directly) so `className` works
- **Helpers**: `cn()` from `@/tw/cn` (clsx + tailwind-merge); `AnimatedView` from `@/tw/animated`; `Image` from `@/tw/image`

<!-- BEGIN opencode-rag -->
## Code Navigation

ALWAYS use OpenCodeRAG tools before reading or editing:
- **Search first** — `search_semantic(query)` instead of grep/glob
- **Skeleton before read** — `get_file_skeleton(filePath)` then read specific lines
- **Usages before edit** — `find_usages(symbolName)` before modifying any symbol
- **Images via describe** — `describe_image(filePath)` — never read raw bytes

If no results, run `opencode-rag index`.
<!-- END opencode-rag -->
