import React from 'react';
import { type ViewStyle } from 'react-native';
import { LiquidGlassView } from '@sbaiahmed1/react-native-blur';
import { useThemeColors } from '@/lib/theme';

/** Liquid-glass surface for floating chrome (tab bar, sheets, FABs).
 *  Never for full-screen cards — surface-lift + hairline is the depth system. */
export function GlassSurface({
  children,
  style,
  borderRadius = 16,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}) {
  const t = useThemeColors();
  return (
    <LiquidGlassView
      glassType="regular"
      glassTintColor={t.glassTint}
      glassOpacity={0.55}
      reducedTransparencyFallbackColor={t.glassTint}
      style={[{ borderRadius, overflow: 'hidden' }, style]}
    >
      {children}
    </LiquidGlassView>
  );
}

export default GlassSurface;
