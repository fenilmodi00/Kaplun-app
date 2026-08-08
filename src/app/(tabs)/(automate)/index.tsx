/**
 * Automations list screen — connection gate, stats, and campaign rows.
 *
 * Styled with NativeWind v5 className via `@/tw` primitives.
 * The per-row toggle is an `@expo/ui` Host island (SwiftUI/Material You Switch).
 *
 * NOTE: verify layout on Android before editing — this screen previously
 * suffered from a `useCssElement` layout bug (ballooned cards, floating text).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FlatList, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Host, Switch as ExpoUISwitch } from '@expo/ui';
import { View, Text, Pressable, ScrollView } from '@/tw';
import { useAutomations, useOverviewStats } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';
import { AnimatedView } from '@/tw/animated';
import { TAB_BAR_CLEARANCE } from '@/components/screen-shell';
import { reportTabBarScroll } from '@/lib/tab-bar-scroll';
import { useThemeScheme } from '@/lib/theme';
import type { Automation } from '@/lib/automations';

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

function getKeywordsPreview(automation: Automation): string {
  if (automation.match_any_word) return 'Any word';
  const keywords = automation.keywords;
  if (keywords.length === 0) return 'No keywords';
  const first = keywords.slice(0, 3).join(', ');
  const rest = keywords.length > 3 ? ` +${keywords.length - 3}` : '';
  return first + rest;
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center gap-3.5 p-4">
      <AnimatedView style={animatedStyle}>
        <View className="max-w-[320px] items-center gap-3.5">
          <Text className="text-center text-error" style={{ fontSize: 14, lineHeight: 20 }}>
            {error}
          </Text>
          <ClayAnimatedButton variant="secondary" onPress={onRetry}>
            Retry
          </ClayAnimatedButton>
        </View>
      </AnimatedView>
    </View>
  );
}

function StatsCard() {
  const { stats, loading } = useOverviewStats();

  return (
    <View className="border border-hairline rounded-[14px] bg-canvas p-3.5 gap-1">
      <View className="flex-row justify-around">
        <View className="items-center gap-0.5">
          <Text className="font-semibold text-ink" style={{ fontSize: 24, lineHeight: 30 }}>
            {loading ? '--' : stats?.sent_7d ?? 0}
          </Text>
          <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>
            DMs sent (7d)
          </Text>
        </View>
        <View className="items-center gap-0.5">
          <Text className="font-semibold text-ink" style={{ fontSize: 24, lineHeight: 30 }}>
            {loading ? '--' : stats?.top_keyword_7d || '—'}
          </Text>
          <Text className="text-muted" style={{ fontSize: 13, lineHeight: 18 }}>
            Top keyword
          </Text>
        </View>
      </View>
      <Text className="mt-1.5 text-center text-muted-soft" style={{ fontSize: 13, lineHeight: 18 }}>
        {loading
          ? 'Loading stats...'
          : `${stats?.active_automations ?? 0} active automation${(stats?.active_automations ?? 0) !== 1 ? 's' : ''}`}
      </Text>
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
    <View className="border border-brand-lavender rounded-[14px] bg-brand-lavender p-3.5 gap-3.5">
      <View className="items-center gap-2 py-3">
        <Ionicons name="logo-instagram" size={32} color="#0a0a0a" />
        <Text className="text-center font-medium text-ink" style={{ fontSize: 16, lineHeight: 22 }}>
          Connect Instagram to enable automations
        </Text>
      </View>
      <ClayAnimatedButton
        variant="primary"
        fullWidth
        loading={isConnecting}
        onPress={onConnect}
      >
        Connect Instagram
      </ClayAnimatedButton>
    </View>
  );
}

function EmptyState() {
  const router = useRouter();
  return (
    <View className="flex-1 items-center justify-center gap-3.5 p-4">
      <Text className="text-center text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
        No automations yet
      </Text>
      <ClayAnimatedButton
        variant="primary"
        onPress={() => router.push('./new' as never)}
      >
        Create your first
      </ClayAnimatedButton>
    </View>
  );
}

function AutomationRow({
  automation,
  onPress,
  onToggle,
  disabled,
}: {
  automation: Automation;
  onPress: () => void;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const isError = automation.status === 'error';
  const scheme = useThemeScheme();

  return (
    <Pressable onPress={onPress} className="border border-hairline rounded-[14px] bg-canvas p-3.5 gap-2">
      <View className="flex-row items-center justify-between gap-2">
        <Text className="flex-1 font-semibold text-ink" style={{ fontSize: 16, lineHeight: 22 }} numberOfLines={1}>
          {automation.name}
        </Text>
        {isError && (
          <View className="rounded-pill bg-error px-2.5 py-1">
            <Text className="font-semibold text-on-primary" style={{ fontSize: 13 }}>
              Reconnect needed
            </Text>
          </View>
        )}
      </View>

      <View className="flex-row items-center gap-2">
        <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
          {getTargetSummary(automation)}
        </Text>
        <Text className="text-muted-soft" style={{ fontSize: 14 }}>
          •
        </Text>
        <Text className="flex-1 text-muted" style={{ fontSize: 14, lineHeight: 20 }} numberOfLines={1}>
          {getKeywordsPreview(automation)}
        </Text>
      </View>

      <View className="flex-row items-center justify-between gap-2 mt-1">
        <View className="rounded-pill bg-surface-card px-2.5 py-1">
          <Text className="font-semibold text-muted" style={{ fontSize: 13 }}>
            -- sent
          </Text>
        </View>
        <Host matchContents colorScheme={scheme} seedColor="#22c55e">
          <ExpoUISwitch
            testID="automation-switch"
            value={automation.status === 'active'}
            onValueChange={onToggle}
            disabled={disabled}
          />
        </Host>
      </View>
    </Pressable>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-row items-start justify-between pb-2" style={{ paddingTop: insets.top + 12 }}>
      <View className="flex-1 gap-0.5">
        <Text className="font-semibold text-ink" style={{ fontSize: 21, lineHeight: 27, letterSpacing: -0.4 }}>
          Automations
        </Text>
        <Text className="text-muted" style={{ fontSize: 14, lineHeight: 20 }}>
          Auto-DM when followers comment keywords
        </Text>
      </View>
      <Pressable
        onPress={onAdd}
        accessibilityLabel="Create automation"
        hitSlop={8}
        className="h-11 w-11 rounded-md items-center justify-center bg-ink/[0.06]"
        style={({ pressed }) => ({ backgroundColor: pressed ? 'rgba(10,10,10,0.14)' : undefined })}
      >
        <Ionicons name="add" size={22} color="#0a0a0a" />
      </Pressable>
    </View>
  );
}

function SkeletonRow() {
  return <View className="h-[88px] rounded-[14px] border border-hairline bg-white" />;
}

export default function AutomateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { connected, loading: gateLoading, connect } = useAutomationGate();
  const [isConnecting, setIsConnecting] = useState(false);
  const lastY = useRef(0);

  const handleScroll = useCallback((e: { nativeEvent: NativeScrollEvent }) => {
    const y = e.nativeEvent.contentOffset.y;
    const dy = y - lastY.current;
    lastY.current = y;
    reportTabBarScroll(dy);
  }, []);

  const {
    automations,
    loading: automationsLoading,
    error: automationsError,
    refresh,
    toggleStatus,
    togglingId,
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
    router.push('./new' as never);
  }, [router]);

  const renderItem = useCallback(
    ({ item }: { item: Automation }) => (
      <AutomationRow
        automation={item}
        onPress={() => handlePress(item)}
        onToggle={() => handleToggle(item)}
        disabled={togglingId === item.$id}
      />
    ),
    [handlePress, handleToggle, togglingId]
  );

  const keyExtractor = useCallback((item: Automation) => item.$id, []);

  const listBottomPadding = insets.bottom + TAB_BAR_CLEARANCE;

  const scrollContentStyle = { paddingHorizontal: 16, paddingTop: 4, gap: 12, paddingBottom: listBottomPadding };
  const scrollContentCenterStyle = { paddingHorizontal: 16, paddingTop: 4, gap: 12, flexGrow: 1, justifyContent: 'center' as const, paddingBottom: listBottomPadding };

  // Connection-check loading state
  if (gateLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <View className="gap-2.5 py-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Not connected
  if (!connected) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <ConnectionGate onConnect={handleConnect} isConnecting={isConnecting} />
        </ScrollView>
      </View>
    );
  }

  // Connected — loading
  if (automationsLoading) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <View className="gap-2.5 py-2">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </View>
        </ScrollView>
      </View>
    );
  }

  if (automationsError) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentCenterStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <ErrorState error={automationsError} onRetry={refresh} />
        </ScrollView>
      </View>
    );
  }

  if (automations.length === 0) {
    return (
      <View className="flex-1 bg-canvas">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentCenterStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <EmptyState />
        </ScrollView>
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
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: listBottomPadding, gap: 12 }}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      />
    </View>
  );
}
