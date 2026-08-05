import React from 'react';
import { View, Text } from '@/tw';
import { cn } from '@/tw/cn';
import { Card } from './card';
import { Switch } from './switch';
import { Reveal } from './reveal';

export interface ToggleCardProps extends React.ComponentProps<typeof View> {
  title: string;
  description?: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  isDisabled?: boolean;
  accessibilityLabel?: string;
  className?: string;
  children?: React.ReactNode;
}

export function ToggleCard({
  title,
  description,
  value,
  onValueChange,
  isDisabled,
  accessibilityLabel,
  className,
  children,
  ...rest
}: ToggleCardProps) {
  return (
    <Card variant="outline" size="md" className={cn('gap-3', className)} {...rest}>
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 gap-0.5">
          {/* Font metrics inline — typography tokens balloon on Android (see radio.tsx) */}
          <Text className="font-medium text-ink" style={{ fontSize: 15, lineHeight: 20 }}>{title}</Text>
          {description ? (
            <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>{description}</Text>
          ) : null}
        </View>
        <Switch
          value={value}
          onValueChange={onValueChange}
          isDisabled={isDisabled}
          accessibilityLabel={accessibilityLabel}
        />
      </View>
      {value && children ? (
        <Reveal>
          <View className="mt-1 gap-3 border-t border-hairline pt-3">
            {children}
          </View>
        </Reveal>
      ) : null}
    </Card>
  );
}
