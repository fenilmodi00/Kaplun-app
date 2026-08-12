import React, { useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useCSSVariable } from 'uniwind';
import type { InstagramMediaResponse } from '@/lib/instagram';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { Image } from '@/tw/image';
import { cn } from '@/tw/cn';
import { AnimatedView } from '@/tw/animated';
import { Pop } from '@/components/ui/reveal';
import { usePressFeedback } from './hooks';

export function PressableScale({
  children,
  onPress,
  disabled,
  style,
  className,
  ...rest
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: React.ComponentProps<typeof AnimatedView>['style'];
  className?: string;
} & Omit<React.ComponentProps<typeof Pressable>, 'onPress' | 'disabled' | 'style' | 'className'>) {
  const { onPressIn, onPressOut, animatedStyle } = usePressFeedback(0.97);
  const handlePressIn = useCallback(() => {
    if (disabled) return;
    onPressIn();
  }, [disabled, onPressIn]);
  const handlePressOut = useCallback(() => {
    if (disabled) return;
    onPressOut();
  }, [disabled, onPressOut]);
  return (
    <AnimatedView style={[animatedStyle, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        disabled={disabled}
        className={className}
        {...rest}
      >
        {children}
      </Pressable>
    </AnimatedView>
  );
}

export function KeywordChip({ keyword, onRemove }: { keyword: string; onRemove: () => void }) {
  return (
    <View className="h-[30px] flex-row items-center rounded-full bg-primary px-3">
      <Text className="font-medium text-primary-foreground" style={{ fontSize: 13 }}>{keyword}</Text>
      <PressableScale onPress={onRemove} hitSlop={8} accessibilityLabel={`Remove ${keyword}`} style={{ marginLeft: 4 }}>
        <Text className="font-semibold text-primary-foreground" style={{ fontSize: 15, lineHeight: 18 }}>
          ×
        </Text>
      </PressableScale>
    </View>
  );
}

export function MediaCarousel({
  media,
  selectedIds,
  onToggle,
}: {
  media: InstagramMediaResponse[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ gap: 10, paddingVertical: 4 }}
    >
      {media.map((item) => {
        const selected = selectedIds.includes(item.id);
        const uri = item.thumbnail_url ?? item.media_url ?? undefined;
        const isReel = item.media_product_type === 'REELS' || item.media_type === 'VIDEO';
        return (
          <PressableScale
            key={item.id}
            onPress={() => onToggle(item.id)}
            style={{ width: 108, height: 192 }}
            className={cn(
              'relative overflow-hidden rounded-xl',
              selected ? 'border-2 border-primary' : 'border-2 border-transparent'
            )}
            accessibilityLabel={item.caption ?? 'Media thumbnail'}
          >
            {uri ? (
              <Image
                source={{ uri }}
                className="h-full w-full"
                resizeMode="cover"
                accessibilityLabel=""
              />
            ) : (
              <View className="h-full w-full items-center justify-center bg-muted">
                <Text className="text-muted-foreground" style={{ fontSize: 12 }}>No img</Text>
              </View>
            )}
            {isReel && (
              <View className="absolute left-2 top-2 rounded bg-foreground/70 px-1.5 py-0.5">
                <Text className="font-semibold text-primary-foreground" style={{ fontSize: 10 }}>REELS</Text>
              </View>
            )}
            {selected && (
              <View className="absolute inset-0 items-center justify-center bg-primary/40">
                <Pop>
                  <View className="h-7 w-7 items-center justify-center rounded-full bg-primary shadow-sm">
                    <Ionicons name="checkmark" size={18} color={primaryForeground} />
                  </View>
                </Pop>
              </View>
            )}
          </PressableScale>
        );
      })}
    </ScrollView>
  );
}
