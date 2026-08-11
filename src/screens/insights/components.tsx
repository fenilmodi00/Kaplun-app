import React from 'react';
import { View } from '@/tw';

export { Reveal } from '@/components/ui/reveal';

export function SkeletonBlock({ height, style }: { height: number; style?: object }) {
  return (
    <View
      className="bg-surface-card border border-hairline"
      style={[{ height, borderRadius: 16 }, style]}
    />
  );
}
