import { useCssElement } from 'react-native-css';
import { useUnstableNativeVariable } from 'nativewind';
import { Link as RouterLink } from 'expo-router';
import React from 'react';
import {
  View as RNView, Text as RNText, Pressable as RNPressable,
  ScrollView as RNScrollView, TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput, StyleSheet, type ViewStyle,
} from 'react-native';

export function Link(props: { href: string; className?: string; [key: string]: unknown }): React.ReactElement {
  return useCssElement(RouterLink as unknown as React.ComponentType<Record<string, unknown>>, props, { className: 'style' });
}
Link.Trigger = RouterLink.Trigger;
Link.Menu = RouterLink.Menu;
Link.MenuAction = RouterLink.MenuAction;
Link.Preview = RouterLink.Preview;

// CSS variable hook (web returns var() string; native resolves to actual value)
export const useCSSVariable =
  process.env.EXPO_OS !== 'web'
    ? useUnstableNativeVariable
    : (variable: string) => `var(${variable})`;

export type ViewProps = React.ComponentProps<typeof RNView> & { className?: string };
export function View(props: ViewProps): React.ReactElement {
  return useCssElement(RNView, props as Record<string, unknown>, { className: 'style' });
}
View.displayName = 'CSS(View)';

export function Text(props: React.ComponentProps<typeof RNText> & { className?: string }): React.ReactElement {
  return useCssElement(RNText as unknown as React.ComponentType<Record<string, unknown>>, props, { className: 'style' });
}
Text.displayName = 'CSS(Text)';

export const ScrollView = React.forwardRef<RNScrollView, React.ComponentProps<typeof RNScrollView> & {
  className?: string; contentContainerClassName?: string;
}>(function ScrollView(props, ref) {
  return useCssElement(RNScrollView as unknown as React.ComponentType<Record<string, unknown>>, { ...props, ref }, {
    className: 'style',
    contentContainerClassName: 'contentContainerStyle',
  });
});
ScrollView.displayName = 'CSS(ScrollView)';

export function Pressable(
  props: React.ComponentProps<typeof RNPressable> & { className?: string },
): React.ReactElement {
  return useCssElement(RNPressable as unknown as React.ComponentType<Record<string, unknown>>, props, { className: 'style' });
}
Pressable.displayName = 'CSS(Pressable)';

export function TextInput(
  props: React.ComponentProps<typeof RNTextInput> & { className?: string },
): React.ReactElement {
  return useCssElement(RNTextInput as unknown as React.ComponentType<Record<string, unknown>>, props, { className: 'style' });
}
TextInput.displayName = 'CSS(TextInput)';

export const AnimatedScrollView = ScrollView;

function XXTouchableHighlight(props: { style?: unknown; underlayColor?: string; [key: string]: unknown }) {
  const { underlayColor, ...rest } = props;
  const flattened = (StyleSheet.flatten(rest.style as ViewStyle) || {}) as ViewStyle;
  return <RNTouchableHighlight underlayColor={underlayColor} {...rest} style={flattened} />;
}
export function TouchableHighlight(
  props: { style?: unknown; underlayColor?: string; className?: string; [key: string]: unknown },
): React.ReactElement {
  return useCssElement(XXTouchableHighlight as React.ComponentType<Record<string, unknown>>, props, { className: 'style' });
}
