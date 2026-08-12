import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, useWindowDimensions } from 'react-native';
import { BlurView, LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import {
  Easing,
  Reanimated,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from '@/lib/reanimated-platform';
import { View } from '@/tw';

/** iOS 26+ — same gate as `GlassSurface`. */
const HAS_NATIVE_GLASS =
  Platform.OS === 'ios' && Number.parseInt(String(Platform.Version), 10) >= 26;

/** Shared with `index.tsx` — open ends together; close uses the same duration. */
export const SHEET_OPEN_MS = 240;
export const SHEET_CONTENT_OPEN_DELAY_MS = 10;
export const SHEET_CLOSE_MS = 100;

/**
 * Blurred + dimmed scrim behind the sheet. Fades in/out in sync with the
 * sheet presentation. Rendered as a sibling of the sheet panel inside the
 * Modal — no Host wrapper needed (the @expo/ui Host is gone).
 */
export function BottomSheetBackdrop({ visible }: { visible: boolean }) {
  const { width, height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const opacity = useSharedValue(visible ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, { duration: SHEET_OPEN_MS, easing: Easing.out(Easing.ease) });
    } else {
      opacity.value = withTiming(
        0,
        { duration: SHEET_CLOSE_MS, easing: Easing.in(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(setMounted)(false);
        },
      );
    }
  }, [visible, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;

  return (
    <Reanimated.View
      style={[StyleSheet.absoluteFill, { width, height }, animatedStyle]}
      pointerEvents="none"
    >
      {HAS_NATIVE_GLASS ? (
        <LiquidGlassView
          glassType="clear"
          glassTintColor="clear"
          reducedTransparencyFallbackColor="rgba(0,0,0,0.5)"
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <BlurView
          blurType="light"
          blurAmount={10}
          reducedTransparencyFallbackColor="rgba(0,0,0,0.5)"
          style={StyleSheet.absoluteFill}
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]} />
    </Reanimated.View>
  );
}
