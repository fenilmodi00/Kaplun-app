import React from 'react';
import Animated from 'react-native-reanimated';
import { View, Pressable } from '@/tw';
import { cn } from '@/tw/cn';
import { useEntranceAnimation, usePressAnimation } from '@/hooks/useClayAnimations';

export function ClayAnimatedCard({
  children, onPress, delay = 0,
  backgroundColor = 'bg-canvas', borderRadius = 'rounded-lg',
  padding = 'p-6', borderWidth = 1, borderColor = 'border-hairline',
}: {
  children: React.ReactNode; onPress?: () => void; delay?: number;
  backgroundColor?: string; borderRadius?: string;
  padding?: string; borderWidth?: number; borderColor?: string;
}) {
  const { animatedStyle: entranceStyle } = useEntranceAnimation(delay);
  const { onPressIn, onPressOut, animatedStyle: pressStyle } = usePressAnimation(0.97);

  const inner = (
    <View className={cn(backgroundColor, borderRadius, padding, borderColor, borderWidth > 0 && 'border')}>
      {children}
    </View>
  );

  // RN View has no onPress — conditionally wrap in Pressable (Metis #6)
  return (
    <Animated.View style={[entranceStyle, onPress ? pressStyle : undefined]}>
      {onPress ? (
        <Pressable onPressIn={onPressIn} onPressOut={onPressOut} onPress={onPress}>
          {inner}
        </Pressable>
      ) : inner}
    </Animated.View>
  );
}
export default ClayAnimatedCard;
