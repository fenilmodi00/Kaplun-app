import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { View, Text, Pressable } from '@/tw';
import { cn } from '@/tw/cn';
import { useAutomations } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';
import { AnimatedView } from '@/tw/animated';
import type { Automation } from '@/lib/automations';
import { Ionicons } from '@expo/vector-icons';

// ── Helpers ──────────────────────────────────────────────────────────

function getTargetSummary(automation: Automation): string {
  switch (automation.target_type) {
    case 'all_posts':
      return 'All posts';
    case 'specific_posts':
      return `${automation.media_ids.length} posts`;
    case 'next_reel':
      return 'Next reel';
    default:
      return 'All posts';
  }
}

function getKeywordsPreview(keywords: string[]): string {
  if (keywords.length === 0) return 'No keywords';
  const first = keywords.slice(0, 3).join(', ');
  const rest = keywords.length > 3 ? ` +${keywords.length - 3}` : '';
  return first + rest;
}

// ── Sub-components ───────────────────────────────────────────────────

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
      <AnimatedView style={animatedStyle}>
        <View className="max-w-[320px] items-center gap-4">
          <Text className="text-center text-body-sm text-error">{error}</Text>
          <ClayAnimatedButton variant="secondary" onPress={onRetry}>
            Retry
          </ClayAnimatedButton>
        </View>
      </AnimatedView>
    </View>
  );
}

function StatsCard() {
  return (
    <View className="mx-4 mb-3">
      <ClayAnimatedCard delay={0}>
        <View className="flex-row justify-around">
          <View className="items-center">
            <Text className="font-semibold text-ink" style={{ fontSize: 24 }}>
              --
            </Text>
            <Text className="text-caption text-muted">Sent</Text>
          </View>
          <View className="items-center">
            <Text className="font-semibold text-ink" style={{ fontSize: 24 }}>
              --
            </Text>
            <Text className="text-caption text-muted">Replies</Text>
          </View>
          <View className="items-center">
            <Text className="font-semibold text-ink" style={{ fontSize: 24 }}>
              --
            </Text>
            <Text className="text-caption text-muted">Conversions</Text>
          </View>
        </View>
        <Text className="mt-2 text-center text-caption text-muted-soft">
          Stats arrive after your first sends
        </Text>
      </ClayAnimatedCard>
    </View>
  );
}

function ConnectionGate({
  onConnect,
  isConnecting,
}: {
  onConnect: () => void;
  isConnecting: boolean;
}) {
  return (
    <View className="mx-4 my-2">
      <ClayAnimatedCard backgroundColor="bg-brand-lavender" delay={100}>
        <View className="gap-4">
          <View className="items-center gap-2" style={{ paddingVertical: 12 }}>
            <Ionicons name="logo-instagram" size={32} color="#0a0a0a" />
            <Text
              className="text-center font-medium text-ink"
              style={{ fontSize: 16, lineHeight: 22 }}
            >
              Connect Instagram to enable automations
            </Text>
          </View>
          <ClayAnimatedButton
            variant="primary"
            fullWidth
            loading={isConnecting}
            onPress={onConnect}
          >
            <View className="flex-row items-center gap-2">
              <Ionicons name="logo-instagram" size={16} color="#ffffff" />
              <Text className="font-semibold text-white">Connect Instagram</Text>
            </View>
          </ClayAnimatedButton>
        </View>
      </ClayAnimatedCard>
    </View>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-3 bg-canvas p-4">
      <Text className="text-center text-body-sm text-muted">No automations yet</Text>
      <ClayAnimatedButton
        variant="primary"
        onPress={() => router.push('/(tabs)/(automate)/new' as never)}
      >
        Create your first
      </ClayAnimatedButton>
    </View>
  );
}

function AutomationRow({
  automation,
  index,
  onPress,
  onToggle,
}: {
  automation: Automation;
  index: number;
  onPress: () => void;
  onToggle: () => void;
}) {
  const isError = automation.status === 'error';

  return (
    <View className="mx-4 my-1.5">
      <ClayAnimatedCard onPress={onPress} delay={index * 80}>
        <View className="gap-2">
          {/* Top row: name + error badge */}
          <View className="flex-row items-center justify-between">
            <Text
              className="flex-1 text-title-sm font-semibold text-ink"
              numberOfLines={1}
            >
              {automation.name}
            </Text>
            {isError && (
              <View className={cn('rounded-pill px-2.5 py-1', 'bg-error')}>
                <Text className={cn('text-caption font-semibold', 'text-on-dark')}>
                  Reconnect needed
                </Text>
              </View>
            )}
          </View>

          {/* Target + keywords */}
          <View className="flex-row items-center gap-2">
            <Text className="text-body-sm text-muted">
              {getTargetSummary(automation)}
            </Text>
            <Text className="text-body-sm text-muted-soft">•</Text>
            <Text className="flex-1 text-body-sm text-muted" numberOfLines={1}>
              {getKeywordsPreview(automation.keywords)}
            </Text>
          </View>

          {/* Bottom row: sent count + switch */}
          <View className="mt-1 flex-row items-center justify-between">
            <View className="rounded-pill bg-surface-card px-2.5 py-1">
              <Text className="text-caption font-semibold text-muted">-- sent</Text>
            </View>
            <Switch
              testID="automation-switch"
              value={automation.status === 'active'}
              onValueChange={onToggle}
              trackColor={{ false: '#e5e5e5', true: '#22c55e' }}
            />
          </View>
        </View>
      </ClayAnimatedCard>
    </View>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  return (
    <View className="flex-row items-start justify-between px-4 pt-4 pb-2">
      <View className="flex-1">
        <Text
          className="font-semibold text-ink"
          style={{ fontSize: 21, letterSpacing: -0.4 }}
        >
          Automations
        </Text>
        <Text className="text-body-sm text-muted">
          Auto-DM when followers comment keywords
        </Text>
      </View>
      <Pressable
        onPress={onAdd}
        className="items-center justify-center"
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          backgroundColor: 'rgba(10,10,10,0.06)',
        }}
      >
        <Ionicons name="add" size={22} color="#0a0a0a" />
      </Pressable>
    </View>
  );
}

function SkeletonRow() {
  return (
    <View
      className="mx-4 my-1.5 bg-white border border-hairline"
      style={{ height: 88, borderRadius: 14 }}
    />
  );
}

// ── Main screen ──────────────────────────────────────────────────────

export default function AutomateScreen() {
  const router = useRouter();
  const { connected, loading: gateLoading, connect } = useAutomationGate();
  const [isConnecting, setIsConnecting] = useState(false);

  const {
    automations,
    loading: automationsLoading,
    error: automationsError,
    refresh,
    toggleStatus,
  } = useAutomations();

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      await connect();
    } catch {
      // OAuth cancellation is expected — ignore
    } finally {
      setIsConnecting(false);
    }
  }, [connect]);

  const handlePress = useCallback(
    (automation: Automation) => {
      router.push(`/(tabs)/(automate)/${automation.$id}` as never);
    },
    [router]
  );

  const handleToggle = useCallback(
    (automation: Automation) => {
      toggleStatus(automation);
    },
    [toggleStatus]
  );

  const handleAdd = useCallback(() => {
    router.push('/(tabs)/(automate)/new' as never);
  }, [router]);

  const renderItem = useCallback(
    ({ item, index }: { item: Automation; index: number }) => (
      <AutomationRow
        automation={item}
        index={index}
        onPress={() => handlePress(item)}
        onToggle={() => handleToggle(item)}
      />
    ),
    [handlePress, handleToggle]
  );

  const keyExtractor = useCallback((item: Automation) => item.$id, []);

  // Connection-check loading state
  if (gateLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <StatsCard />
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  // Not connected
  if (!connected) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ConnectionGate onConnect={handleConnect} isConnecting={isConnecting} />
      </View>
    );
  }

  // Connected — handle automations states
  if (automationsLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <StatsCard />
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </View>
      </View>
    );
  }

  if (automationsError) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <StatsCard />
        <ErrorState error={automationsError} onRetry={refresh} />
      </View>
    );
  }

  if (automations.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <StatsCard />
        <EmptyState />
      </View>
    );
  }

  // List state
  return (
    <View className="flex-1 bg-canvas">
      <FlatList
        data={automations}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        ListHeaderComponent={
          <>
            <Header onAdd={handleAdd} />
            <StatsCard />
          </>
        }
        contentContainerStyle={{ paddingVertical: 8, paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
