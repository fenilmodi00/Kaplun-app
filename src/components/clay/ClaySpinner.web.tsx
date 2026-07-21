import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { CLAY_FONTS } from '@/lib/fonts';

const CLAY_COLORS = {
  primary: '#0a0a0a',
  muted: '#6a6a6a',
} as const;

/** Web-only spinner — Expo Go uses ClaySpinner.tsx with Reanimated. */
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
  return (
    <View style={styles.wrap}>
      <ActivityIndicator size={size > 32 ? 'large' : 'small'} color={CLAY_COLORS[color]} />
      {label ? (
        <Text style={[styles.label, { color: CLAY_COLORS[labelColor] }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  label: {
    fontFamily: CLAY_FONTS.regular,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
});

export default ClaySpinner;
