import React, { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { AnimatedView } from '@/tw/animated';
import {
  IS_REANIMATED_AVAILABLE,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  withDelay,
} from '@/lib/reanimated-platform';

/**
 * Entrance/pop wrappers. Shared values initialize at their FINAL state when
 * Reanimated is unavailable (web), so content never stays invisible there.
 */

export function Reveal({
  children,
  delay = 0,
  style,
}: {
  children: React.ReactNode;
  delay?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(IS_REANIMATED_AVAILABLE ? 0 : 1);
  const translateY = useSharedValue(IS_REANIMATED_AVAILABLE ? 8 : 0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1));
    translateY.value = withDelay(delay, withTiming(0));
  }, [delay, opacity, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}

export function Pop({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const scale = useSharedValue(IS_REANIMATED_AVAILABLE ? 0.4 : 1);

  useEffect(() => {
    scale.value = withSpring(1);
  }, [scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <AnimatedView style={[animatedStyle, style]}>{children}</AnimatedView>;
}
