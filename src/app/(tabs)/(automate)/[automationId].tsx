/**
 * Automation detail screen — status, stats, config summary, activity feed.
 *
 * NOTE: raw React Native + StyleSheet instead of `@/tw` className primitives.
 * The useCssElement bridge drops layout classes on Android (same ballooning
 * the builder had). See src/tw/AGENTS.md for the documented escape hatch.
 */

import React, { useCallback, useMemo } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useAutomations, useAutomationLogs, useAutomationStats } from '@/hooks/useAutomations';
import type { Automation, AutomationLog } from '@/lib/automations';
import { TAB_BAR_OVERLAY } from '@/components/screen-shell';

const COLORS = {
  canvas: '#fffaf0',
  ink: '#0a0a0a',
  muted: '#6a6a6a',
  mutedSoft: '#9a9a9a',
  hairline: '#e5e5e5',
  surfaceCard: '#f5f0e0',
  surfaceSoft: '#faf5e8',
  teal: '#1a3a3a',
  ochre: '#e8b94a',
  pink: '#ff4d8b',
  mint: '#a4d4c5',
  mintTint: 'rgba(164, 212, 197, 0.25)',
  ochreTint: 'rgba(232, 185, 74, 0.20)',
  error: '#ef4444',
  white: '#ffffff',
};

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

/** Action badge colors per DESIGN.md §3.3 */
const ACTION_META: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  dm_sent: { bg: COLORS.teal, text: COLORS.white, label: 'Sent' },
  button_dm_sent: { bg: COLORS.teal, text: COLORS.white, label: 'Sent' },
  reveal_sent: { bg: COLORS.teal, text: COLORS.white, label: 'Sent' },
  reply_sent: { bg: COLORS.teal, text: COLORS.white, label: 'Sent' },
  skipped: { bg: COLORS.ochre, text: COLORS.ink, label: 'Skipped' },
  failed: { bg: COLORS.pink, text: COLORS.white, label: 'Failed' },
  pending: { bg: COLORS.surfaceCard, text: COLORS.muted, label: 'Pending' },
};

const STATUS_META: Record<string, { bg: string; text: string }> = {
  active: { bg: COLORS.mint, text: COLORS.ink },
  paused: { bg: COLORS.ochre, text: COLORS.ink },
  error: { bg: COLORS.pink, text: COLORS.white },
};

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function computeStats(logs: AutomationLog[]) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const log of logs) {
    const action = log.action;
    if (action === 'dm_sent' || action === 'button_dm_sent' || action === 'reveal_sent' || action === 'reply_sent') {
      sent += 1;
    } else if (action === 'skipped') {
      skipped += 1;
    } else if (action === 'failed') {
      failed += 1;
    }
  }
  return { sent, skipped, failed };
}

function targetLabel(automation: Automation): string {
  switch (automation.target_type) {
    case 'all_posts':
      return 'All posts';
    case 'specific_posts':
      return `Specific posts (${automation.media_ids.length})`;
    case 'next_reel':
      return 'Next reel';
    default:
      return 'Unknown';
  }
}

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LogRow({ log }: { log: AutomationLog }) {
  const meta = ACTION_META[log.action] ?? ACTION_META.pending;

  return (
    <View style={styles.logRow}>
      <View style={styles.logBody}>
        <View style={styles.logTopRow}>
          <Text style={styles.logUsername} numberOfLines={1}>
            {log.commenter_username ?? 'Unknown'}
          </Text>
          <Text style={styles.logTime}>{formatRelativeTime(log.created_at)}</Text>
        </View>
        <Text style={styles.logComment} numberOfLines={1}>
          {log.comment_text ?? '—'}
        </Text>
        <View style={styles.logBadgeRow}>
          {log.matched_keyword ? (
            <View style={styles.keywordChip}>
              <Text style={styles.keywordChipText}>{log.matched_keyword}</Text>
            </View>
          ) : null}
          <View style={[styles.actionBadge, { backgroundColor: meta.bg }]}>
            <Text style={[styles.actionBadgeText, { color: meta.text }]}>
              {meta.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AutomationDetail() {
  const { automationId, created } = useLocalSearchParams<{ automationId: string; created?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { automations, toggleStatus, deleteAutomation } = useAutomations();
  const { logs, loading, error, refresh } = useAutomationLogs(automationId ?? '');
  const { stats: apiStats, loading: statsLoading } = useAutomationStats(automationId ?? '');

  const automation = useMemo(
    () => automations.find((a) => a.$id === automationId) ?? null,
    [automations, automationId],
  );

  const stats = useMemo(() => computeStats(logs), [logs]);

  const handlePauseResume = useCallback(() => {
    if (!automation) return;
    toggleStatus(automation);
  }, [automation, toggleStatus]);

  const handleDelete = useCallback(() => {
    if (!automation) return;
    Alert.alert(
      'Delete Automation',
      `Are you sure you want to delete "${automation.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => deleteAutomation(automation.$id),
        },
      ],
    );
  }, [automation, deleteAutomation]);

  const renderItem = useCallback(
    ({ item }: { item: AutomationLog }) => <LogRow log={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: AutomationLog) => item.$id ?? `${item.comment_id}-${item.created_at}`,
    [],
  );

  const statusMeta = automation
    ? (STATUS_META[automation.status] ?? { bg: COLORS.surfaceCard, text: COLORS.muted })
    : { bg: COLORS.surfaceCard, text: COLORS.muted };

  const isPaused = automation?.status === 'paused';

  // Loading state
  if (loading && !automation) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateMuted}>Loading automation...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateError}>{error}</Text>
        <ClayAnimatedButton variant="secondary" onPress={refresh}>
          Retry
        </ClayAnimatedButton>
      </View>
    );
  }

  // Not found state
  if (!automation) {
    return (
      <View style={styles.centerState}>
        <Text style={styles.stateMuted}>Automation not found</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      {/* Header: back + name + status */}
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={24} color={COLORS.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {automation.name}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusMeta.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusMeta.text }]}>
            {automation.status}
          </Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.sent ?? stats.sent)}
          label="Sent"
        />
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.skipped ?? stats.skipped)}
          label="Skipped"
        />
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.failed ?? stats.failed)}
          label="Failed"
        />
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.clicks ?? 0)}
          label="Clicks"
        />
        <StatCell
          value={statsLoading ? '--' : apiStats ? `${(apiStats.ctr * 100).toFixed(0)}%` : '0%'}
          label="CTR"
        />
      </View>

      {/* Activity feed */}
      <View style={styles.feedWrap}>
        <FlatList
          data={logs}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.feedHeader}>
              {/* Post-creation guidance: the engine has no test endpoint, so
                  the honest "test" is to comment on the targeted post and
                  watch the activity feed below. */}
              {created === 'live' && (
                <View style={[styles.noticeCard, styles.noticeLive]}>
                  <Text style={styles.noticeTitle}>You're live!</Text>
                  <Text style={styles.noticeBody}>
                    Test it now: comment{' '}
                    {automation.match_any_word
                      ? 'anything'
                      : `one of your keywords (e.g. "${automation.keywords[0] ?? ''}")`}{' '}
                    on your post — the DM fires automatically and shows up in
                    Activity below.
                  </Text>
                </View>
              )}
              {created === 'paused' && (
                <View style={[styles.noticeCard, styles.noticePaused]}>
                  <Text style={styles.noticeTitle}>Saved as paused</Text>
                  <Text style={styles.noticeBody}>
                    Nothing fires while paused. Hit Resume below when you're ready to go live.
                  </Text>
                </View>
              )}

              {/* Config summary card */}
              <View style={styles.configCard}>
                <Text style={styles.configTitle}>Configuration</Text>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Target</Text>
                  <Text style={styles.configValue}>{targetLabel(automation)}</Text>
                </View>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Keywords</Text>
                  <Text style={styles.configValue} numberOfLines={1}>
                    {automation.match_any_word ? 'Any word' : automation.keywords.join(', ')}
                  </Text>
                </View>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Match mode</Text>
                  <Text style={[styles.configValue, styles.capitalize]}>
                    {automation.match_mode.replace(/_/g, ' ')}
                  </Text>
                </View>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>DM text</Text>
                  <Text style={styles.configValue} numberOfLines={1}>
                    {automation.dm_message}
                  </Text>
                </View>
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Public reply</Text>
                  <Text style={styles.configValue}>
                    {automation.public_reply_enabled
                      ? `On${automation.public_reply_messages?.length ? ` (${automation.public_reply_messages.length + (automation.public_reply_message ? 1 : 0)} in pool)` : ''}`
                      : 'Off'}
                  </Text>
                </View>
                {automation.public_reply_enabled && automation.public_reply_messages?.length > 0 && (
                  <View style={styles.poolWrap}>
                    {automation.public_reply_message && (
                      <Text style={styles.poolItem} numberOfLines={1}>• {automation.public_reply_message}</Text>
                    )}
                    {automation.public_reply_messages.map((msg) => (
                      <Text key={msg} style={styles.poolItem} numberOfLines={1}>• {msg}</Text>
                    ))}
                  </View>
                )}
              </View>

              {logs.length > 0 ? (
                <Text style={styles.activityTitle}>Activity</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.stateMuted}>
                No activity yet — comments will appear here
              </Text>
            </View>
          }
        />
      </View>

      {/* Actions row */}
      <View
        style={[
          styles.actionsRow,
          { paddingBottom: insets.bottom + TAB_BAR_OVERLAY },
        ]}
      >
        <View style={styles.actionCell}>
          <ClayAnimatedButton
            variant="secondary"
            onPress={handlePauseResume}
            fullWidth
          >
            {isPaused ? 'Resume' : 'Pause'}
          </ClayAnimatedButton>
        </View>
        <View style={styles.actionCell}>
          <ClayAnimatedButton
            variant="primary"
            onPress={handleDelete}
            fullWidth
          >
            Delete
          </ClayAnimatedButton>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: COLORS.canvas,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: COLORS.canvas,
  },
  stateMuted: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.muted,
  },
  stateError: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.error,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: COLORS.canvas,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontFamily: FONT.semibold,
    fontSize: 18,
    lineHeight: 25,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  statusBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 12,
    lineHeight: 17,
    letterSpacing: 1.5,
    textTransform: 'capitalize',
    includeFontPadding: false,
  },

  /* Stats strip */
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.canvas,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  statCell: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
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

  /* Feed */
  feedWrap: {
    flex: 1,
  },
  feedHeader: {
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  noticeCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    gap: 4,
  },
  noticeLive: {
    backgroundColor: COLORS.mintTint,
    borderColor: COLORS.mint,
  },
  noticePaused: {
    backgroundColor: COLORS.ochreTint,
    borderColor: COLORS.ochre,
  },
  noticeTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  noticeBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
  },
  configCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.hairline,
    backgroundColor: COLORS.canvas,
    padding: 14,
    gap: 8,
  },
  configTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  configRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  configLabel: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
  configValue: {
    maxWidth: '60%',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
  },
  capitalize: {
    textTransform: 'capitalize',
  },
  poolWrap: {
    gap: 2,
    paddingLeft: 4,
  },
  poolItem: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  activityTitle: {
    marginTop: 4,
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: COLORS.ink,
    includeFontPadding: false,
  },

  /* Log rows */
  logRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.hairline,
  },
  logBody: {
    gap: 4,
  },
  logTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  logUsername: {
    flexShrink: 1,
    fontFamily: FONT.semibold,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.ink,
    includeFontPadding: false,
  },
  logTime: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.mutedSoft,
    includeFontPadding: false,
  },
  logComment: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.muted,
  },
  logBadgeRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keywordChip: {
    borderRadius: 999,
    backgroundColor: COLORS.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  keywordChipText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: COLORS.muted,
    includeFontPadding: false,
  },
  actionBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  actionBadgeText: {
    fontFamily: FONT.semibold,
    fontSize: 13,
    includeFontPadding: false,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },

  /* Actions row */
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: COLORS.canvas,
    borderTopWidth: 1,
    borderTopColor: COLORS.hairline,
  },
  actionCell: {
    flex: 1,
  },
});
