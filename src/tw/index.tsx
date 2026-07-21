import { useCssElement } from 'react-native-css';
import { useUnstableNativeVariable } from 'nativewind';
import { Link as RouterLink } from 'expo-router';
import React from 'react';
import {
  View as RNView, Text as RNText, Pressable as RNPressable,
  ScrollView as RNScrollView, TouchableHighlight as RNTouchableHighlight,
  TextInput as RNTextInput, StyleSheet, type ViewStyle,
} from 'react-native';

export const Link = (props: React.ComponentProps<typeof RouterLink> & { className?: string }) =>
  useCssElement(RouterLink, props, { className: 'style' });
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
export const View = (props: ViewProps) => useCssElement(RNView, props, { className: 'style' });
View.displayName = 'CSS(View)';

export const Text = (props: React.ComponentProps<typeof RNText> & { className?: string }) =>
  useCssElement(RNText, props, { className: 'style' });
Text.displayName = 'CSS(Text)';

export const ScrollView = (
  props: React.ComponentProps<typeof RNScrollView> & {
    className?: string; contentContainerClassName?: string;
  },
) => useCssElement(RNScrollView, props, {
  className: 'style', contentContainerClassName: 'contentContainerStyle',
});
ScrollView.displayName = 'CSS(ScrollView)';

export const Pressable = (
  props: React.ComponentProps<typeof RNPressable> & { className?: string },
) => useCssElement(RNPressable, props, { className: 'style' });
Pressable.displayName = 'CSS(Pressable)';

export const TextInput = (
  props: React.ComponentProps<typeof RNTextInput> & { className?: string },
) => useCssElement(RNTextInput, props, { className: 'style' });
TextInput.displayName = 'CSS(TextInput)';

/** Alias — prefer Reanimated scroll views from screen files when needed.
 *  Kept as RN ScrollView here so `@/tw` never statically imports reanimated (web #8285). */
export const AnimatedScrollView = ScrollView;

function XXTouchableHighlight(props: React.ComponentProps<typeof RNTouchableHighlight>) {
  const { underlayColor, ...style } = (StyleSheet.flatten(props.style) || {}) as ViewStyle & {
    underlayColor?: React.ComponentProps<typeof RNTouchableHighlight>['underlayColor'];
  };
  return <RNTouchableHighlight underlayColor={underlayColor} {...props} style={style} />;
}
export const TouchableHighlight = (props: React.ComponentProps<typeof RNTouchableHighlight>) =>
  useCssElement(XXTouchableHighlight, props, { className: 'style' });
