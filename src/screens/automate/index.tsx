/**
 * Automations list screen — connection gate, stats, and campaign rows.
 *
 * PanelUI migration (Phase 2, screen 5): rows are `Item`, status pills are
 * `Badge`, the per-row toggle is PanelUI `Switch` (the @expo/ui Host island
 * is gone), and cards/empty/error states are `Card`/`Surface`/`EmptyState`.
 * Layout-only primitives still come from `@/tw` (Uniwind className).
 */

import React, { useState, useCallback, useRef } from 'react';
import { FlatList, type NativeScrollEvent } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { View, Pressable, ScrollView, useCSSVariable } from '@/tw';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Item,
  Skeleton,
  Surface,
  Switch,
  Text,
} from 'panelui-native';
import { useAutomations, useOverviewStats } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { TAB_BAR_CLEARANCE } from '@/components/screen-shell';
import { reportTabBarScroll } from '@/lib/tab-bar-scroll';
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

function StatsCard() {
  const { stats, loading } = useOverviewStats();

  return (
    <Card>
      <Card.Content className="gap-1">
        <View className="flex-row justify-around">
          <View className="items-center gap-0.5">
            <Text size="2xl" weight="semibold">
              {loading ? '--' : stats?.sent_7d ?? 0}
            </Text>
            <Text size="sm" muted>
              DMs sent (7d)
            </Text>
          </View>
          <View className="items-center gap-0.5">
            <Text size="2xl" weight="semibold">
              {loading ? '--' : stats?.top_keyword_7d || '—'}
            </Text>
            <Text size="sm" muted>
              Top keyword
            </Text>
          </View>
        </View>
        <Text size="sm" muted className="mt-1.5 text-center">
          {loading
            ? 'Loading stats...'
            : `${stats?.active_automations ?? 0} active automation${(stats?.active_automations ?? 0) !== 1 ? 's' : ''}`}
        </Text>
      </Card.Content>
    </Card>
  );
}

function ConnectionGate({
  onConnect,
  isConnecting,
}: {
  onConnect: () => void;
  isConnecting: boolean;
}) {
  const foreground = useCSSVariable('--color-foreground') as string;
  const primaryForeground = useCSSVariable('--color-primary-foreground') as string;
  return (
    <Surface bordered padding="lg">
      <View className="items-center gap-2 py-3">
        <Ionicons name="logo-instagram" size={32} color={foreground} />
        <Text weight="medium" className="text-center">
          Connect Instagram to enable automations
        </Text>
      </View>
      <Button
        fullWidth
        size="lg"
        loading={isConnecting}
        onPress={onConnect}
        startContent={<Ionicons name="logo-instagram" size={17} color={primaryForeground} />}
      >
        Connect Instagram
      </Button>
    </Surface>
  );
}

function AutomationsEmptyState() {
  const router = useRouter();
  return (
    <EmptyState>
      <EmptyState.Header>
        <EmptyState.Title>No automations yet</EmptyState.Title>
      </EmptyState.Header>
      <EmptyState.Content>
        <Button onPress={() => router.push('./new' as never)}>
          Create your first
        </Button>
      </EmptyState.Content>
    </EmptyState>
  );
}

function AutomationsErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <EmptyState>
      <EmptyState.Header>
        <EmptyState.Title>Couldn't load automations</EmptyState.Title>
        <EmptyState.Description>{error}</EmptyState.Description>
      </EmptyState.Header>
      <EmptyState.Content>
        <Button variant="outline" onPress={onRetry}>
          Retry
        </Button>
      </EmptyState.Content>
    </EmptyState>
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

  return (
    <Item orientation="vertical" variant="outline" onPress={onPress}>
      <Item.Content className="w-full gap-2">
        <View className="flex-row items-center gap-2">
          <Item.Title numberOfLines={1} className="flex-1">
            {automation.name}
          </Item.Title>
          {isError && <Badge variant="destructive">Reconnect needed</Badge>}
        </View>
        <View className="flex-row items-center gap-2">
          <Item.Description numberOfLines={1}>
            {getTargetSummary(automation)}
          </Item.Description>
          <Text size="sm" muted>
            •
          </Text>
          <Item.Description numberOfLines={1} className="flex-1">
            {getKeywordsPreview(automation)}
          </Item.Description>
        </View>
      </Item.Content>
      <Item.Footer className="w-full flex-row items-center justify-between gap-2">
        <Badge variant="secondary">-- sent</Badge>
        <Switch
          value={automation.status === 'active'}
          onValueChange={onToggle}
          disabled={disabled}
        />
      </Item.Footer>
    </Item>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  const foreground = useCSSVariable('--color-foreground') as string;
  return (
    <View className="flex-row items-start justify-between pb-2" style={{ paddingTop: insets.top + 12 }}>
      <View className="flex-1 gap-0.5">
        <Text size="xl" weight="semibold" className="tracking-tight">
          Automations
        </Text>
        <Text size="sm" muted>
          Auto-DM when followers comment keywords
        </Text>
      </View>
      <Pressable
        onPress={onAdd}
        accessibilityLabel="Create automation"
        accessibilityRole="button"
        hitSlop={8}
        className="h-11 w-11 items-center justify-center rounded-md bg-secondary"
      >
        <Ionicons name="add" size={22} color={foreground} />
      </Pressable>
    </View>
  );
}

function SkeletonRow() {
  return <Skeleton className="h-[88px] rounded-xl" />;
}

export default function AutomationsScreen() {
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
      <View className="flex-1 bg-background">
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
      <View className="flex-1 bg-background">
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
      <View className="flex-1 bg-background">
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
      <View className="flex-1 bg-background">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentCenterStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <AutomationsErrorState error={automationsError} onRetry={refresh} />
        </ScrollView>
      </View>
    );
  }

  if (automations.length === 0) {
    return (
      <View className="flex-1 bg-background">
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={scrollContentCenterStyle} onScroll={handleScroll} scrollEventThrottle={16}>
          <StatsCard />
          <AutomationsEmptyState />
        </ScrollView>
      </View>
    );
  }

  // List state
  return (
    <View className="flex-1 bg-background">
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
