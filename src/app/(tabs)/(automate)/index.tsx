/**
 * Automations list screen — connection gate, stats, and campaign rows.
 *
 * NOTE: raw React Native + StyleSheet instead of `@/tw` className primitives.
 * The useCssElement bridge drops layout classes on Android (ballooned cards,
 * floating text) — same failure this screen had before. See src/tw/AGENTS.md
 * for the documented raw-RN escape hatch.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAutomations, useOverviewStats } from '@/hooks/useAutomations';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';
import { AnimatedView } from '@/tw/animated';
import { TAB_BAR_CLEARANCE } from '@/components/screen-shell';
import type { Automation } from '@/lib/automations';

const COLORS = {
  canvas: '#fffaf0',
  ink: '#0a0a0a',
  muted: '#6a6a6a',
  mutedSoft: '#9a9a9a',
  hairline: '#e5e5e5',
  surfaceSoft: '#faf5e8',
  surfaceCard: '#f5f0e0',
  lavender: '#b8a4ed',
  error: '#ef4444',
  white: '#ffffff',
  success: '#22c55e',
};

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

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
    <View style={styles.stateWrap}>
      <AnimatedView style={animatedStyle}>
        <View style={styles.stateInner}>
          <Text style={styles.stateError}>{error}</Text>
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
    <View style={[styles.card, styles.statsCard]}>
      <View style={styles.statsRow}>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{loading ? '--' : stats?.sent_7d ?? 0}</Text>
          <Text style={styles.statLabel}>DMs sent (7d)</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{loading ? '--' : stats?.clicks_7d ?? 0}</Text>
          <Text style={styles.statLabel}>Link clicks (7d)</Text>
        </View>
        <View style={styles.statCell}>
          <Text style={styles.statValue}>{loading ? '--' : stats?.top_keyword_7d || '—'}</Text>
          <Text style={styles.statLabel}>Top keyword</Text>
        </View>
      </View>
      <Text style={styles.statsFooter}>
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
    <View style={[styles.card, styles.gateCard]}>
      <View style={styles.gateHeader}>
        <Ionicons name="logo-instagram" size={32} color={COLORS.ink} />
        <Text style={styles.gateTitle}>Connect Instagram to enable automations</Text>
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
    <View style={styles.stateWrap}>
      <Text style={styles.stateMuted}>No automations yet</Text>
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
  onPress,
  onToggle,
}: {
  automation: Automation;
  onPress: () => void;
  onToggle: () => void;
}) {
  const isError = automation.status === 'error';

  return (
    <Pressable onPress={onPress} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {automation.name}
        </Text>
        {isError && (
          <View style={styles.errorBadge}>
            <Text style={styles.errorBadgeText}>Reconnect needed</Text>
          </View>
        )}
      </View>

      <View style={styles.rowMeta}>
        <Text style={styles.metaText}>{getTargetSummary(automation)}</Text>
        <Text style={styles.metaDot}>•</Text>
        <Text style={[styles.metaText, styles.metaKeywords]} numberOfLines={1}>
          {getKeywordsPreview(automation)}
        </Text>
      </View>

      <View style={[styles.rowBetween, styles.rowBottom]}>
        <View style={styles.sentPill}>
          <Text style={styles.sentPillText}>-- sent</Text>
        </View>
        <Switch
          testID="automation-switch"
          value={automation.status === 'active'}
          onValueChange={onToggle}
          trackColor={{ false: COLORS.hairline, true: COLORS.success }}
        />
      </View>
    </Pressable>
  );
}

function Header({ onAdd }: { onAdd: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle}>Automations</Text>
        <Text style={styles.headerSubtitle}>Auto-DM when followers comment keywords</Text>
      </View>
      <Pressable
        onPress={onAdd}
        accessibilityLabel="Create automation"
        style={styles.addBtn}
      >
        <Ionicons name="add" size={22} color={COLORS.ink} />
      </Pressable>
    </View>
  );
}

function SkeletonRow() {
  return <View style={styles.skeleton} />;
}

export default function AutomateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
    ({ item }: { item: Automation }) => (
      <AutomationRow
        automation={item}
        onPress={() => handlePress(item)}
        onToggle={() => handleToggle(item)}
      />
    ),
    [handlePress, handleToggle]
  );

  const keyExtractor = useCallback((item: Automation) => item.$id, []);

  const listBottomPadding = insets.bottom + TAB_BAR_CLEARANCE;

  // Connection-check loading state
  if (gateLoading) {
    return (
      <View style={styles.screen}>
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}>
          <StatsCard />
          <View style={styles.skeletonStack}>
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
      <View style={styles.screen}>
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}>
          <ConnectionGate onConnect={handleConnect} isConnecting={isConnecting} />
        </ScrollView>
      </View>
    );
  }

  // Connected — loading
  if (automationsLoading) {
    return (
      <View style={styles.screen}>
        <Header onAdd={handleAdd} />
        <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}>
          <StatsCard />
          <View style={styles.skeletonStack}>
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
      <View style={styles.screen}>
        <Header onAdd={handleAdd} />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.centerContent, { paddingBottom: listBottomPadding }]}
        >
          <StatsCard />
          <ErrorState error={automationsError} onRetry={refresh} />
        </ScrollView>
      </View>
    );
  }

  if (automations.length === 0) {
    return (
      <View style={styles.screen}>
        <Header onAdd={handleAdd} />
        <ScrollView
          contentContainerStyle={[styles.scrollContent, styles.centerContent, { paddingBottom: listBottomPadding }]}
        >
          <StatsCard />
          <EmptyState />
        </ScrollView>
      </View>
    );
  }

  // List state
  return (
    <View style={styles.screen}>
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
        contentContainerStyle={[styles.scrollContent, { paddingBottom: listBottomPadding }]}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 12,
  },
  centerContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  skeletonStack: {
    gap: 10,
    paddingVertical: 8,
  },
  skeleton: {
    height: 88,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.white,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    fontFamily: FONT.semibold,
    fontSize: 21,
    lineHeight: 27,
    letterSpacing: -0.4,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  headerSubtitle: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  addBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,10,10,0.06)',
  },

  /* Cards */
  card: {
    borderWidth: 1,
    borderColor: COLORS.hairline,
    borderRadius: 14,
    backgroundColor: COLORS.canvas,
    padding: 14,
    gap: 8,
  },
  statsCard: {
    gap: 4,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  statCell: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: FONT.semibold,
    fontSize: 24,
    lineHeight: 30,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  statsFooter: {
    marginTop: 6,
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedSoft,
    includeFontPadding: false,
  },

  /* Connection gate */
  gateCard: {
    backgroundColor: COLORS.lavender,
    borderColor: COLORS.lavender,
    gap: 14,
  },
  gateHeader: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  gateTitle: {
    textAlign: 'center',
    fontFamily: FONT.medium,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
  },

  /* Rows */
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    flex: 1,
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  errorBadge: {
    borderRadius: 999,
    backgroundColor: COLORS.error,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  errorBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    color: COLORS.white,
    includeFontPadding: false,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  metaText: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  metaDot: {
    fontFamily: FONT.regular,
    fontSize: 14,
    color: COLORS.mutedSoft,
  },
  metaKeywords: {
    flex: 1,
  },
  rowBottom: {
    marginTop: 4,
  },
  sentPill: {
    borderRadius: 999,
    backgroundColor: COLORS.surfaceCard,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sentPillText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    color: COLORS.muted,
    includeFontPadding: false,
  },

  /* States */
  stateWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: 16,
  },
  stateInner: {
    maxWidth: 320,
    alignItems: 'center',
    gap: 14,
  },
  stateError: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.error,
  },
  stateMuted: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
});
