/**
 * Accordion for radio/toggle expand regions.
 * Opens instantly (no height clip); closes with 220ms ease-out height fade.
 */

import React, { useEffect, useRef } from 'react';
import { View } from '@/tw';
import { AnimatedView } from '@/tw/animated';
import {
  Easing,
  IS_REANIMATED_AVAILABLE,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from '@/lib/reanimated-platform';

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const DURATION_MS = 220;

export interface CollapsibleProps {
  expanded: boolean;
  children: React.ReactNode;
  onTransitionEnd?: () => void;
}

export function Collapsible({ expanded, children, onTransitionEnd }: CollapsibleProps) {
  /** 1 = fully open, 0 = fully closed, (0,1) = collapsing */
  const heightProgress = useSharedValue(expanded ? 1 : 0);
  /** Cached full height captured while open — used only during collapse animation */
  const contentHeight = useSharedValue(0);
  const onEndRef = useRef(onTransitionEnd);
  onEndRef.current = onTransitionEnd;

  useEffect(() => {
    if (expanded) {
      // Instant open — never clip with a partial height while measuring or re-expanding
      heightProgress.value = 1;
      onEndRef.current?.();
      return;
    }

    if (!IS_REANIMATED_AVAILABLE) {
      heightProgress.value = 0;
      onEndRef.current?.();
      return;
    }

    heightProgress.value = withTiming(0, { duration: DURATION_MS, easing: EASE_OUT });
    const timer = setTimeout(() => {
      onEndRef.current?.();
    }, DURATION_MS);
    return () => clearTimeout(timer);
  }, [expanded, heightProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    const open = heightProgress.value >= 1;
    if (open) {
      // No height constraint — content lays out naturally and can grow (e.g. reels load in)
      return { opacity: 1, overflow: 'hidden' as const };
    }

    const measured = contentHeight.value;
    return {
      height: measured > 0 ? heightProgress.value * measured : 0,
      opacity: 0.35 + heightProgress.value * 0.65,
      overflow: 'hidden' as const,
    };
  });

  if (!IS_REANIMATED_AVAILABLE && !expanded) {
    return null;
  }

  return (
    <AnimatedView style={animatedStyle}>
      <View
        onLayout={(e) => {
          const next = e.nativeEvent.layout.height;
          // Only grow the cache — never shrink to 0 when parent is collapsed/clipped
          if (next > contentHeight.value) {
            contentHeight.value = next;
          }
        }}
        pointerEvents={expanded ? 'auto' : 'none'}
      >
        {children}
      </View>
    </AnimatedView>
  );
}
