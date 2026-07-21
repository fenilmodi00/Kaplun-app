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

const CLAY_COLORS = {
  primary: '#0a0a0a',
  muted: '#6a6a6a',
} as const;

export function ClaySpinner({
  size = 40,
  color = 'primary',
  label,
  labelColor = 'muted',
}: {
  size?: number;
  color?: keyof typeof CLAY_COLORS;
  label?: string;
  labelColor?: keyof typeof CLAY_COLORS;
}) {
  const rotation = useSharedValue(0);
  const resolvedColor = CLAY_COLORS[color];
  const resolvedLabelColor = CLAY_COLORS[labelColor];

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
