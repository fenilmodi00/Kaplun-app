import React from 'react';
import { View, StyleSheet, type ViewStyle, type View as RNView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface EdgeBlurProps {
  position: 'top' | 'bottom';
  height: number;
  /** Unused — kept for call-site compatibility. The native blur layer was
   * removed: remounting expo-blur's dimezisBlurViewSdk31Plus with a blur
   * target crashed Android on screen transitions. */
  blurTarget?: React.RefObject<RNView | null>;
  /** Kept for call-site compatibility; only >= 80 changes the scrim strength. */
  intensity?: number;
  style?: ViewStyle;
}

const CANVAS_SCRIM_START = 'rgba(255,250,240,0)';
const CANVAS_SCRIM_MID = 'rgba(255,250,240,0.45)';
const CANVAS_SCRIM_END = 'rgba(255,250,240,0.92)';

/**
 * Edge fade (formerly a real blur). Renders a plain canvas gradient scrim —
 * no MaskedView, no BlurView — so it can mount/unmount freely during
 * navigation transitions.
 */
export function EdgeBlur({
  position,
  height,
  intensity = 32,
  style,
}: EdgeBlurProps) {
  const isTop = position === 'top';
  const isHeavy = intensity >= 80;

  const scrimColors = isHeavy
    ? ([CANVAS_SCRIM_START, CANVAS_SCRIM_MID, CANVAS_SCRIM_END] as const)
    : ([CANVAS_SCRIM_START, CANVAS_SCRIM_END] as const);
  const scrimLocations = isHeavy ? ([0, 0.6, 1] as const) : undefined;

  return (
    <View style={[{ height }, style]} pointerEvents="none">
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={scrimColors}
        locations={scrimLocations}
        start={{ x: 0, y: isTop ? 1 : 0 }}
        end={{ x: 0, y: isTop ? 0 : 1 }}
      />
    </View>
  );
}

export default EdgeBlur;
