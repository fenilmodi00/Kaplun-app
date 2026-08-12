import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { View, useCSSVariable } from '@/tw';
import { Alert, Button, Card, Skeleton, Text } from 'panelui-native';

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text size="xs" weight="semibold" muted className="uppercase tracking-wider">
      {children}
    </Text>
  );
}

export function ScoreSkeleton() {
  return (
    <View className="gap-4">
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-30 rounded-2xl" />
      <Skeleton className="h-50 rounded-2xl" />
    </View>
  );
}

export function GateCard({
  icon,
  title,
  body,
  ctaLabel,
  loading,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  ctaLabel: string;
  loading: boolean;
  onPress: () => void;
}) {
  const foreground = useCSSVariable('--color-foreground') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
  return (
    <Card className="items-center gap-3 p-5">
      <View className="h-13 w-13 items-center justify-center rounded-full bg-info-soft">
        <Ionicons name={icon} size={24} color={foreground} />
      </View>
      <Text size="lg" weight="semibold" className="text-center tracking-tight">
        {title}
      </Text>
      <Text size="sm" muted className="max-w-70 text-center">
        {body}
      </Text>
      <Button
        variant="primary"
        fullWidth
        loading={loading}
        onPress={onPress}
        startContent={<Ionicons name="logo-instagram" size={16} color={primaryForeground} />}
      >
        {ctaLabel}
      </Button>
    </Card>
  );
}

export function InlineErrorStrip({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert variant="destructive" className="items-center">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Description numberOfLines={2}>
          Couldn’t load your score — {message}
        </Alert.Description>
      </Alert.Content>
      <Button variant="secondary" size="sm" onPress={onRetry}>
        Retry
      </Button>
    </Alert>
  );
}

export function EmptyState({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  const foreground = useCSSVariable('--color-foreground') as string;
  return (
    <Card className="items-center gap-3 p-5">
      <View className="h-13 w-13 items-center justify-center rounded-full bg-success-soft">
        <Ionicons name="speedometer" size={24} color={foreground} />
      </View>
      <Text size="lg" weight="semibold" className="text-center tracking-tight">
        Get your AI Profile Score
      </Text>
      <Text size="sm" muted className="max-w-70 text-center">
        One score from your last 30 days — engagement, posting rhythm, growth — plus the 3 moves to make next.
      </Text>
      <Button variant="primary" fullWidth loading={generating} onPress={onGenerate}>
        Generate my score
      </Button>
      {generating ? (
        <Text size="xs" muted className="text-center">
          Crunching your stats — this can take up to a minute. Keep the app open.
        </Text>
      ) : null}
    </Card>
  );
}
