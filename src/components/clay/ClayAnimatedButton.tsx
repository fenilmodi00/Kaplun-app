import React, { useCallback } from 'react';
import {
  Pressable,
  ActivityIndicator,
  View,
  Text,
  StyleSheet,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { CLAY_FONTS } from '@/lib/fonts';
import { usePressAnimation } from '@/hooks/useClayAnimations';

type Variant = 'primary' | 'secondary' | 'on-color' | 'text-link';

/** Clay colors via StyleSheet — avoids NativeWind useCssElement layout bugs on Android. */
const COLORS = {
  primary: '#0a0a0a',
  canvas: '#fffaf0',
  hairline: '#e5e5e5',
  ink: '#0a0a0a',
  onPrimary: '#ffffff',
} as const;

const VARIANT_BG: Record<Variant, object> = {
  primary: { backgroundColor: COLORS.primary },
  secondary: {
    backgroundColor: COLORS.canvas,
    borderWidth: 1,
    borderColor: COLORS.hairline,
  },
  'on-color': { backgroundColor: COLORS.onPrimary },
  'text-link': { backgroundColor: 'transparent' },
};

const VARIANT_TEXT: Record<Variant, string> = {
  primary: COLORS.onPrimary,
  secondary: COLORS.ink,
  'on-color': COLORS.ink,
  'text-link': COLORS.ink,
};

export function ClayAnimatedButton({
  children,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  maxWidth,
  height = 44,
}: {
  children: React.ReactNode;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  maxWidth?: number;
  height?: number;
}) {
  const { onPressIn, onPressOut, animatedStyle } = usePressAnimation(0.96);
  const handlePress = useCallback(() => {
    if (!disabled && !loading) onPress();
  }, [disabled, loading, onPress]);

  return (
    <Pressable
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={handlePress}
      disabled={disabled || loading}
      style={{
        width: fullWidth ? '100%' : maxWidth,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Animated.View style={animatedStyle}>
        <View style={[styles.base, VARIANT_BG[variant], { height }]}>
          {loading ? (
            <ActivityIndicator size="small" color={VARIANT_TEXT[variant]} />
          ) : (
            <Text style={[styles.label, { color: VARIANT_TEXT[variant] }]}>{children}</Text>
          )}
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 12,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: CLAY_FONTS.semibold,
    fontSize: 14,
    lineHeight: 14,
  },
});

export default ClayAnimatedButton;
