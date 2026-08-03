import React from 'react';
import { View, StyleSheet, type ViewStyle, type View as RNView } from 'react-native';
import MaskedView from '@react-native-masked-view/masked-view';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';

export interface EdgeBlurProps {
  position: 'top' | 'bottom';
  height: number;
  blurTarget: React.RefObject<RNView | null>;
  /** Blur intensity 1–100. Defaults to 32. */
  intensity?: number;
  style?: ViewStyle;
}

const CANVAS_SCRIM_START = 'rgba(255,250,240,0)';
const CANVAS_SCRIM_END = 'rgba(255,250,240,0.55)';
const CANVAS_SCRIM_END_HEAVY = 'rgba(255,250,240,0.92)';

export function EdgeBlur({
  position,
  height,
  blurTarget,
  intensity = 32,
  style,
}: EdgeBlurProps) {
  const isTop = position === 'top';
  const isHeavy = intensity >= 80;

  // Mask gradient: transparent → ~0.75 opaque → opaque black.
  // The start/end direction flips per position so the opaque edge is always
  // at the screen edge (top for 'top', bottom for 'bottom').
  const maskColors = ['transparent', 'rgba(0,0,0,0.75)', 'black'] as const;
  const maskLocations = [0, 0.6, 1] as const;

  // Scrim strengthens toward the screen edge; heavy blur uses a denser end stop
  // so content behind the bar is fully obscured.
  const scrimColors = [
    CANVAS_SCRIM_START,
    isHeavy ? CANVAS_SCRIM_END_HEAVY : CANVAS_SCRIM_END,
  ] as const;

  return (
    <MaskedView
      style={[{ height }, style]}
      pointerEvents="none"
      maskElement={
        <LinearGradient
          style={StyleSheet.absoluteFill}
          colors={maskColors}
          locations={maskLocations}
          start={{ x: 0, y: isTop ? 1 : 0 }}
          end={{ x: 0, y: isTop ? 0 : 1 }}
        />
      }
    >
      <BlurView
        style={StyleSheet.absoluteFill}
        intensity={intensity}
        tint="light"
        blurMethod="dimezisBlurViewSdk31Plus"
        blurReductionFactor={isHeavy ? 1 : 4}
        blurTarget={blurTarget}
      />
      <LinearGradient
        style={StyleSheet.absoluteFill}
        colors={scrimColors}
        start={{ x: 0, y: isTop ? 1 : 0 }}
        end={{ x: 0, y: isTop ? 0 : 1 }}
      />
    </MaskedView>
  );
}

export default EdgeBlur;
