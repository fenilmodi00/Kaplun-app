import { useCallback } from 'react';
import { View } from '@/tw/index';
import { useSharedValue, useAnimatedStyle, withSequence, withTiming } from '@/lib/reanimated-platform';

/** Web: plain tw.View — never import reanimated (Worklets #8285). */
export const AnimatedView = View;

export function useShakeAnimation() {
  const translateX = useSharedValue(0);

  const shake = useCallback(() => {
    translateX.value = withSequence(
      withTiming(10, { duration: 50 }),
      withTiming(-10, { duration: 50 }),
      withTiming(6, { duration: 50 }),
      withTiming(-6, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
  }, [translateX]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return { shake, animatedStyle };
}
