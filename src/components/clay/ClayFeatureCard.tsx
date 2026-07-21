import React from 'react';
import Animated from 'react-native-reanimated';
import { View, Text } from '@/tw';
import { cn, clayFeatureCardBase } from '@/tw/cn';
import { useEntranceAnimation } from '@/hooks/useClayAnimations';

type Color = 'pink' | 'teal' | 'lavender' | 'peach' | 'ochre' | 'cream';

const COLOR: Record<Color, { bg: string; text: string }> = {
  pink: { bg: 'bg-brand-pink', text: 'text-on-dark' },
  teal: { bg: 'bg-brand-teal', text: 'text-on-dark' },
  lavender: { bg: 'bg-brand-lavender', text: 'text-ink' },
  peach: { bg: 'bg-brand-peach', text: 'text-ink' },
  ochre: { bg: 'bg-brand-ochre', text: 'text-ink' },
  cream: { bg: 'bg-surface-card', text: 'text-ink' },
};

// Transitional: accept legacy space tokens until screens are migrated (Phase 4)
type Padding = 'p-6' | 'p-8' | '$lg' | '$xl';
const LEGACY_PADDING: Record<string, string> = { '$lg': 'p-6', '$xl': 'p-8' };

export function ClayFeatureCard({
  children, color, title, description, delay = 0, padding = 'p-8',
}: {
  children?: React.ReactNode; color: Color; title?: string; description?: string;
  delay?: number; padding?: Padding;
}) {
  const { animatedStyle } = useEntranceAnimation(delay);
  const s = COLOR[color];
  const paddingClass = LEGACY_PADDING[padding] ?? padding;
  return (
    <Animated.View style={[{ flex: 1 }, animatedStyle]}>
      <View className={cn(clayFeatureCardBase, s.bg, s.text, paddingClass)}>
        {title && <Text className="text-title-md font-semibold tracking-[-0.3px]">{title}</Text>}
        {description && <Text className="text-body-sm opacity-90">{description}</Text>}
        {children}
      </View>
    </Animated.View>
  );
}
export default ClayFeatureCard;
