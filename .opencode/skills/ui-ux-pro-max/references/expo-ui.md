# Expo UI Reference — Kaplun App

`@expo/ui` renders real native UI: SwiftUI on iOS and Jetpack Compose on Android. Use it when the standard React Native primitives or Clay components feel insufficient for native-feeling controls (pickers, menus, toggles, grouped lists, sliders, bottom sheets).

## When to Use

- You need a control that Clay does not provide and that should feel truly native.
- The component will be used heavily on one platform and a native look is more important than cross-platform pixel parity.
- You are building a settings/form screen with grouped rows, switches, menus, or date pickers.

## When to Prefer Clay / `@/tw` Instead

- Brand consistency (colors, radius, typography) is more important than native appearance.
- The component needs heavy customization not exposed by `@expo/ui`.
- You need shared animations with Reanimated or web-variant support.

## Core Concepts

### Host

Every `@expo/ui` tree needs a `Host` (iOS) / `RNHostView` (Android) at the root. The Host is the bridge surface that renders the native view hierarchy.

```tsx
import { Host } from '@expo/ui';

export function NativeScreen() {
  return (
    <Host style={{ flex: 1 }}>
      {/* SwiftUI / Jetpack Compose content */}
    </Host>
  );
}
```

### Universal vs Platform-Specific

- **Universal components** (`Column`, `Row`, `Button`, `Text`, `List`) work on both platforms but render native views under the hood.
- **Platform-specific imports**: use `@expo/ui/swift-ui` for iOS-only SwiftUI trees and `@expo/ui/jetpack-compose` for Android-only Compose trees.

For Kaplun, prefer universal components unless a platform-specific design absolutely requires it.

## Universal Components

| Component | Import | Use For |
|---|---|---|
| `Host` | `@expo/ui` | Root container for any native UI tree |
| `Column` | `@expo/ui` | Vertical layout (native stack) |
| `Row` | `@expo/ui` | Horizontal layout (native stack) |
| `Button` | `@expo/ui` | Native-feeling button |
| `Text` | `@expo/ui` | Native text label |
| `List` | `@expo/ui` | Native grouped list/table |

## Drop-in Replacements for Community Libraries

`@expo/ui` ships wrappers that mirror popular React Native community APIs:

- `BottomSheet` — replace `@gorhom/bottom-sheet`
- `DateTimePicker` — replace `@react-native-community/datetimepicker`
- `Slider` — replace `@react-native-community/slider`
- `Menu` — replace context menus / action sheets

Use these when you want the native implementation without adding another community dependency.

## Example: Grouped Settings List

```tsx
import { Host, List, Text } from '@expo/ui';

export function SettingsScreen() {
  return (
    <Host style={{ flex: 1 }}>
      <List>
        <List.Item>
          <Text>Account</Text>
        </List.Item>
        <List.Item>
          <Text>Notifications</Text>
        </List.Item>
      </List>
    </Host>
  );
}
```

## Example: Platform-Specific SwiftUI (iOS only)

```tsx
import { Host } from '@expo/ui';
import { Form, Section, Toggle } from '@expo/ui/swift-ui';

export function iOSOnlySettings() {
  return (
    <Host style={{ flex: 1 }}>
      <Form>
        <Section header="Preferences">
          <Toggle value={true} onValueChange={() => {}} />
        </Section>
      </Form>
    </Host>
  );
}
```

## Caveats for Kaplun

1. **Reanimated interop**: `@expo/ui` native trees are rendered outside the React Native view hierarchy. Do not wrap them with Reanimated components; use Reanimated only on sibling `@/tw` / Clay views.
2. **Web support**: `@expo/ui` does not render on web. If a screen uses `@expo/ui`, provide a `.web.tsx` variant using Clay / `@/tw` components.
3. **Theming**: Native components follow the platform design system by default. To match Clay colors, check if the component exposes `tintColor` / `color` props and map them to `src/global.css` tokens.
4. **Safe areas**: Native layouts may already inset content on iOS; verify with `useSafeAreaInsets` from `react-native-safe-area-context` before adding manual padding.

## Further Reading

- Expo UI overview: https://docs.expo.dev/versions/latest/sdk/ui/
- SwiftUI-specific APIs: import from `@expo/ui/swift-ui`
- Jetpack Compose-specific APIs: import from `@expo/ui/jetpack-compose`
