import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { CLAY_FONTS } from '@/lib/fonts';
import { useThemeColors } from '@/lib/theme';

export function ClaySpinner({
  size = 40,
  color = 'primary',
  label,
  labelColor = 'muted',
}: {
  size?: number;
  color?: 'primary' | 'muted';
  label?: string;
  labelColor?: 'primary' | 'muted';
}) {
  const t = useThemeColors();
  const palette = { primary: t.primary, muted: t.muted } as const;
  const rotation = useSharedValue(0);
  const resolvedColor = palette[color];
  const resolvedLabelColor = palette[labelColor];

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: 800, easing: Easing.linear }),
      -1,
      false,
    );
  }, [rotation]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 3,
            borderColor: resolvedColor,
            borderTopColor: 'transparent',
          },
          animatedStyle,
        ]}
      />
      {label ? (
        <Text style={[styles.label, { color: resolvedLabelColor }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
  },
  label: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
});

export default ClaySpinner;
