import React, { useEffect } from 'react';
import { View, Text } from '@/tw';
import { AnimatedView } from '@/tw/animated';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';

export interface ErrorStateProps {
  /** Error message shown to the user. */
  error: string;
  /** Retry handler; when omitted the Retry button is not rendered. */
  onRetry?: () => void;
}

/**
 * Shared error state: centered message + optional Retry button with a
 * mount-time shake. Consolidates the four private copies in
 * (messages)/threads.tsx (canonical variant), (messages)/[threadId].tsx,
 * (automate)/list.tsx, and (profile)/view.tsx. Waves 2-3 adopt this; the
 * private copies stay until then.
 */
export function ErrorState({ error, onRetry }: ErrorStateProps) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
      <AnimatedView style={animatedStyle}>
        <View className="max-w-[320px] items-center gap-4">
          <Text className="text-center text-body-sm text-error">
            {error}
          </Text>
          {onRetry ? (
            <ClayAnimatedButton variant="secondary" onPress={onRetry}>
              Retry
            </ClayAnimatedButton>
          ) : null}
        </View>
      </AnimatedView>
    </View>
  );
}
