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
import { useThemeColors, type ThemeColors } from '@/lib/theme';
import { ACCENTS, computeStats, statusMeta, targetLabel } from './utils';
import { StatCell, LogRow } from './components';

const FONT = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
};

export type AutomationStyles = ReturnType<typeof buildStyles>;

export default function AutomationDetailScreen() {
  const { automationId, created } = useLocalSearchParams<{ automationId: string; created?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useThemeColors();
  const styles = useMemo(() => buildStyles(t), [t]);
  const { automations, toggleStatus, deleteAutomation } = useAutomations();
  const { logs, loading, error, refresh } = useAutomationLogs(automationId ?? '');
  const { stats: apiStats, loading: statsLoading } = useAutomationStats(automationId ?? '');

  const automation = useMemo(
    () => automations.find((a) => a.$id === automationId) ?? null,
    [automations, automationId],
  );

  const replyPool = useMemo(() => {
    if (!automation?.public_reply_enabled) return [];
    const primary = automation.public_reply_message?.trim() ?? '';
    const all = [primary, ...(automation.public_reply_messages ?? [])]
      .map((m) => m.trim())
      .filter(Boolean);
    return [...new Set(all)];
  }, [automation]);

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
    ({ item }: { item: AutomationLog }) => <LogRow log={item} styles={styles} />,
    [styles],
  );

  const keyExtractor = useCallback(
    (item: AutomationLog) => item.$id ?? `${item.comment_id}-${item.created_at}`,
    [],
  );

  const statusMetaValue = automation
    ? (statusMeta(t)[automation.status] ?? { bg: t.surfaceCard, text: t.muted })
    : { bg: t.surfaceCard, text: t.muted };

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
          <Ionicons name="chevron-back" size={24} color={t.ink} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {automation.name}
        </Text>
        <View style={[styles.statusBadge, { backgroundColor: statusMetaValue.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusMetaValue.text }]}>
            {automation.status}
          </Text>
        </View>
      </View>

      {/* Stats strip */}
      <View style={styles.statsStrip}>
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.sent ?? stats.sent)}
          label="Sent"
          styles={styles}
        />
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.skipped ?? stats.skipped)}
          label="Skipped"
          styles={styles}
        />
        <StatCell
          value={statsLoading ? '--' : String(apiStats?.failed ?? stats.failed)}
          label="Failed"
          styles={styles}
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
                      ? `On${replyPool.length > 0 ? ` (${replyPool.length} in pool)` : ''}`
                      : 'Off'}
                  </Text>
                </View>
                {automation.public_reply_enabled && replyPool.length > 0 && (
                  <View style={styles.poolWrap}>
                    {replyPool.map((msg) => (
                      <Text key={msg} style={styles.poolItem} numberOfLines={1}>• {msg}</Text>
                    ))}
                  </View>
                )}
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Follow gate</Text>
                  <Text style={styles.configValue}>
                    {automation.require_follow ? 'On' : 'Off'}
                  </Text>
                </View>
                {automation.require_follow && (
                  <>
                    <View style={styles.configRow}>
                      <Text style={styles.configLabel}>Prompt message</Text>
                      <Text style={styles.configValue} numberOfLines={1}>
                        {automation.follow_prompt_message ?? 'Follow me to unlock the link!'}
                      </Text>
                    </View>
                    <View style={styles.configRow}>
                      <Text style={styles.configLabel}>Button label</Text>
                      <Text style={styles.configValue}>
                        {automation.follow_prompt_button_label ?? 'Follow'}
                      </Text>
                    </View>
                  </>
                )}
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>Follow-up</Text>
                  <Text style={styles.configValue}>
                    {automation.follow_up_enabled
                      ? `On${automation.follow_up_delay_minutes ? ` (${automation.follow_up_delay_minutes}m delay)` : ''}`
                      : 'Off'}
                  </Text>
                </View>
                {automation.follow_up_enabled && automation.follow_up_message && (
                  <View style={styles.configRow}>
                    <Text style={styles.configLabel}>Follow-up msg</Text>
                    <Text style={styles.configValue} numberOfLines={1}>
                      {automation.follow_up_message}
                    </Text>
                  </View>
                )}
                <View style={styles.configRow}>
                  <Text style={styles.configLabel}>DM trigger</Text>
                  <Text style={styles.configValue}>
                    {automation.dm_trigger_enabled ? 'On' : 'Off'}
                  </Text>
                </View>
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

function buildStyles(t: ThemeColors) {
  return StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: t.canvas,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    backgroundColor: t.canvas,
  },
  stateMuted: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 15,
    lineHeight: 21,
    color: t.muted,
  },
  stateError: {
    textAlign: 'center',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: ACCENTS.error,
  },

  /* Header */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 12,
    backgroundColor: t.canvas,
    borderBottomWidth: 1,
    borderBottomColor: t.hairline,
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
    color: t.ink,
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
    backgroundColor: t.canvas,
    borderBottomWidth: 1,
    borderBottomColor: t.hairline,
  },
  statCell: {
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: t.ink,
    includeFontPadding: false,
  },
  statLabel: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: t.muted,
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
    backgroundColor: ACCENTS.mintTint,
    borderColor: ACCENTS.mint,
  },
  noticePaused: {
    backgroundColor: ACCENTS.ochreTint,
    borderColor: ACCENTS.ochre,
  },
  noticeTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: t.ink,
    includeFontPadding: false,
  },
  noticeBody: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.ink,
  },
  configCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: t.hairline,
    backgroundColor: t.canvas,
    padding: 14,
    gap: 8,
  },
  configTitle: {
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: t.ink,
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
    color: t.muted,
  },
  configValue: {
    maxWidth: '60%',
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.ink,
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
    color: t.muted,
    includeFontPadding: false,
  },
  activityTitle: {
    marginTop: 4,
    fontFamily: FONT.semibold,
    fontSize: 16,
    lineHeight: 22,
    color: t.ink,
    includeFontPadding: false,
  },

  /* Log rows */
  logRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.hairline,
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
    color: t.ink,
    includeFontPadding: false,
  },
  logTime: {
    fontFamily: FONT.regular,
    fontSize: 13,
    lineHeight: 18,
    color: t.mutedSoft,
    includeFontPadding: false,
  },
  logComment: {
    fontFamily: FONT.regular,
    fontSize: 14,
    lineHeight: 20,
    color: t.muted,
  },
  logBadgeRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  keywordChip: {
    borderRadius: 999,
    backgroundColor: t.surfaceCard,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  keywordChipText: {
    fontFamily: FONT.regular,
    fontSize: 13,
    color: t.muted,
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
    backgroundColor: t.canvas,
    borderTopWidth: 1,
    borderTopColor: t.hairline,
  },
  actionCell: {
    flex: 1,
  },
  });
}
