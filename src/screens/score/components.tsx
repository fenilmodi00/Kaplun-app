import React from 'react';
import { Ionicons } from '@expo/vector-icons';

import { View, Text, Pressable } from '@/tw';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useThemeColors } from '@/lib/theme';

export function SectionLabel({ children }: { children: string }) {
  return (
    <Text
      className="font-semibold uppercase text-muted"
      style={{ fontSize: 11, letterSpacing: 1.2 }}
    >
      {children}
    </Text>
  );
}

export function ScoreSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      <View className="bg-surface-card border border-hairline rounded-xl" style={{ height: 190 }} />
      <View className="bg-surface-card border border-hairline rounded-xl" style={{ height: 120 }} />
      <View className="bg-surface-card border border-hairline rounded-xl" style={{ height: 200 }} />
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
  const t = useThemeColors();
  return (
    <View
      className="bg-surface-card border border-hairline rounded-xl items-center"
      style={{ padding: 24, gap: 12 }}
    >
      <View
        className="bg-brand-lavender items-center justify-center"
        style={{ width: 52, height: 52, borderRadius: 26 }}
      >
        <Ionicons name={icon} size={24} color={t.ink} />
      </View>
      <Text
        className="font-semibold text-ink text-center"
        style={{ fontSize: 19, letterSpacing: -0.3 }}
      >
        {title}
      </Text>
      <Text className="text-body-sm text-muted text-center" style={{ maxWidth: 280 }}>
        {body}
      </Text>
      <ClayAnimatedButton variant="primary" fullWidth loading={loading} onPress={onPress} height={48}>
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <Ionicons name="logo-instagram" size={16} color={t.onPrimary} />
          <Text className="font-semibold text-white" style={{ fontSize: 14.5 }}>
            {ctaLabel}
          </Text>
        </View>
      </ClayAnimatedButton>
    </View>
  );
}

export function InlineErrorStrip({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useThemeColors();
  return (
    <View
      className="flex-row items-center bg-surface-card border border-hairline rounded-lg"
      style={{ padding: 12, gap: 10 }}
    >
      <Ionicons name="alert-circle-outline" size={16} color={t.error} />
      <Text className="text-muted" style={{ fontSize: 12.5, flex: 1 }} numberOfLines={2}>
        Couldn’t load your score — {message}
      </Text>
      <Pressable onPress={onRetry} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
        <Text className="font-semibold text-ink" style={{ fontSize: 12.5 }}>
          Retry
        </Text>
      </Pressable>
    </View>
  );
}

export function EmptyState({
  generating,
  onGenerate,
}: {
  generating: boolean;
  onGenerate: () => void;
}) {
  const t = useThemeColors();
  return (
    <View
      className="bg-surface-card border border-hairline rounded-xl items-center"
      style={{ padding: 28, gap: 14 }}
    >
      <View
        className="bg-brand-teal items-center justify-center"
        style={{ width: 52, height: 52, borderRadius: 26 }}
      >
        <Ionicons name="speedometer" size={24} color={t.onPrimary} />
      </View>
      <Text
        className="font-semibold text-ink text-center"
        style={{ fontSize: 19, letterSpacing: -0.3 }}
      >
        Get your AI Profile Score
      </Text>
      <Text className="text-body-sm text-muted text-center" style={{ maxWidth: 280 }}>
        One score from your last 30 days — engagement, posting rhythm, growth — plus the 3 moves to make next.
      </Text>
      <ClayAnimatedButton
        variant="primary"
        fullWidth
        loading={generating}
        onPress={onGenerate}
        height={48}
      >
        Generate my score
      </ClayAnimatedButton>
      {generating ? (
        <Text className="text-muted-soft text-center" style={{ fontSize: 12 }}>
          Crunching your stats — this can take up to a minute. Keep the app open.
        </Text>
      ) : null}
    </View>
  );
}
