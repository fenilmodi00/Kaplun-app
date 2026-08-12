import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, Pressable, useCSSVariable } from '@/tw';

export interface BottomSheetHeaderProps {
  title: string;
  subtitle?: string;
  onClose?: () => void;
  testID?: string;
}

export function BottomSheetHeader({ title, subtitle, onClose, testID }: BottomSheetHeaderProps) {
  const ink = useCSSVariable('--color-foreground') as string;

  return (
    <View className="flex-row items-start justify-between gap-3 pb-2" testID={testID}>
      <View className="flex-1 gap-1">
        <Text className="font-display text-title-md text-ink">{title}</Text>
        {subtitle ? <Text className="text-body-sm text-muted">{subtitle}</Text> : null}
      </View>
      {onClose ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={onClose}
          className="-mr-2 h-11 w-11 items-center justify-center"
          testID={testID ? `${testID}-close` : undefined}
        >
          <Ionicons name="close" size={22} color={ink} />
        </Pressable>
      ) : null}
    </View>
  );
}
