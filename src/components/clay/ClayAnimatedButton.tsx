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
import { hapticImpactLight } from '@/lib/haptics';
import { useThemeColors } from '@/lib/theme';

type Variant = 'primary' | 'secondary' | 'on-color' | 'text-link';

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
  const t = useThemeColors();
  const VARIANT_BG: Record<Variant, object> = {
    primary: { backgroundColor: t.primary },
    secondary: {
      backgroundColor: t.canvas,
      borderWidth: 1,
      borderColor: t.hairline,
    },
    'on-color': { backgroundColor: t.onPrimary },
    'text-link': { backgroundColor: 'transparent' },
  };
  const VARIANT_TEXT: Record<Variant, string> = {
    primary: t.onPrimary,
    secondary: t.ink,
    'on-color': t.ink,
    'text-link': t.ink,
  };

  const { onPressIn, onPressOut, animatedStyle } = usePressAnimation(0.96);
  const handlePress = useCallback(() => {
    if (!disabled && !loading) {
      if (variant === 'primary') hapticImpactLight();
      onPress();
    }
  }, [disabled, loading, onPress, variant]);

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
    lineHeight: 18,
    letterSpacing: -0.14,
    includeFontPadding: false,
  },
});

export default ClayAnimatedButton;
