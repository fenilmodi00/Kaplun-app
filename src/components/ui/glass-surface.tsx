import React from 'react';
import { Platform, type ViewStyle } from 'react-native';
import { BlurView, LiquidGlassView } from '@sbaiahmed1/react-native-blur';

/** iOS 26+ has the real system liquid glass; everything else falls back. */
const HAS_NATIVE_GLASS =
  Platform.OS === 'ios' &&
  Number.parseInt(String(Platform.Version), 10) >= 26;

/** Liquid-glass surface for floating chrome (tab bar, sheets, FABs).
 *  Never for full-screen cards — surface-lift + hairline is the depth system.
 *  Pure clear glass in BOTH schemes: no tint, no shade — the pill is
 *  transparent liquid blur only.
 *  iOS 26+: native clear glass (LiquidGlassView, tint 'clear').
 *  Android / older iOS: BlurView with blurType 'dark'. We do NOT use
 *  LiquidGlassView's own fallback here — it hardcodes blurType 'regular',
 *  a ~14% WHITE frost that turns the pill milky. 'dark' keeps it clean glass.
 *  `#151517` survives only as the reduced-transparency accessibility fallback. */
export function GlassSurface({
  children,
  style,
  borderRadius = 16,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
  borderRadius?: number;
}) {
  const glassStyle = [{ borderRadius, overflow: 'hidden' as const }, style];
  if (HAS_NATIVE_GLASS) {
    return (
      <LiquidGlassView
        glassType="clear"
        glassTintColor="clear"
        reducedTransparencyFallbackColor="#151517"
        style={glassStyle}
      >
        {children}
      </LiquidGlassView>
    );
  }
  return (
    <BlurView
      blurType="extraDark"
      blurAmount={10}
      reducedTransparencyFallbackColor="#151517"
      style={glassStyle}
    >
      {children}
    </BlurView>
  );
}

export default GlassSurface;
