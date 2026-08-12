import { useCSSVariable } from 'uniwind';
import { Link as RouterLink } from 'expo-router';
import React from 'react';
import {
  View as RNView,
  Text as RNText,
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput,
  StyleSheet,
  type ViewStyle,
} from 'react-native';
import { useResolveClassNames } from 'uniwind';

// Re-export useCSSVariable from Uniwind (accepts string or array)
export { useCSSVariable };

// Link — re-export expo-router Link with compound components preserved
export const Link = RouterLink;

// Thin re-exports — Uniwind handles className natively on RN components
export const View = RNView;
export const Text = RNText;
export const Pressable = RNPressable;
export const TextInput = RNTextInput;

// ScrollView — forwardRef preserving contentContainerClassName prop
export const ScrollView = React.forwardRef<
  RNScrollView,
  React.ComponentProps<typeof RNScrollView> & {
    className?: string;
    contentContainerClassName?: string;
  }
>(function ScrollView({ contentContainerClassName, contentContainerStyle, ...rest }, ref) {
  const resolvedContentStyle = useResolveClassNames(contentContainerClassName ?? '');
  const mergedContentContainerStyle = contentContainerClassName
    ? StyleSheet.flatten([resolvedContentStyle, contentContainerStyle])
    : contentContainerStyle;
  return (
    <RNScrollView
      ref={ref}
      contentContainerStyle={mergedContentContainerStyle}
      {...rest}
    />
  );
});

// TouchableHighlight — style flattening + underlayColor extraction
export function TouchableHighlight(
  props: React.ComponentProps<typeof RNTouchableHighlight> & {
    className?: string;
    underlayColor?: string;
  },
): React.ReactElement {
  const { underlayColor, style, ...rest } = props;
  const flattened = (StyleSheet.flatten(style as ViewStyle) || {}) as ViewStyle;
  return (
    <RNTouchableHighlight underlayColor={underlayColor} style={flattened} {...rest} />
  );
}
