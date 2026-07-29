import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  Alert,
  Pressable,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text } from '@/tw';
import { cn } from '@/tw/cn';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useAutomations, useAutomationLogs } from '@/hooks/useAutomations';
import type { Automation, AutomationLog } from '@/lib/automations';

/** Action badge colors per DESIGN.md §3.3 */
const ACTION_META: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  dm_sent: { bg: 'bg-brand-teal', text: 'text-on-dark', label: 'Sent' },
  button_dm_sent: { bg: 'bg-brand-teal', text: 'text-on-dark', label: 'Sent' },
  reveal_sent: { bg: 'bg-brand-teal', text: 'text-on-dark', label: 'Sent' },
  reply_sent: { bg: 'bg-brand-teal', text: 'text-on-dark', label: 'Sent' },
  skipped: { bg: 'bg-brand-ochre', text: 'text-ink', label: 'Skipped' },
  failed: { bg: 'bg-brand-pink', text: 'text-on-dark', label: 'Failed' },
  pending: { bg: 'bg-surface-card', text: 'text-muted', label: 'Pending' },
};

const STATUS_META: Record<string, { bg: string; text: string }> = {
  active: { bg: 'bg-brand-mint', text: 'text-ink' },
  paused: { bg: 'bg-brand-ochre', text: 'text-ink' },
  error: { bg: 'bg-brand-pink', text: 'text-on-dark' },
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

function LogRow({ log }: { log: AutomationLog }) {
  const meta = ACTION_META[log.action] ?? ACTION_META.pending;

  return (
    <View className="flex-row items-start gap-3 border-b border-hairline px-4 py-3">
      <View className="flex-1 gap-1">
        <View className="flex-row items-center justify-between">
          <Text className="text-body-sm font-semibold text-ink" numberOfLines={1}>
            {log.commenter_username ?? 'Unknown'}
          </Text>
          <Text className="text-caption text-muted-soft">
            {formatRelativeTime(log.created_at)}
          </Text>
        </View>
        <Text className="text-body-sm text-muted" numberOfLines={1}>
          {log.comment_text ?? '—'}
        </Text>
        <View className="mt-1 flex-row items-center gap-2">
          {log.matched_keyword ? (
            <View className="rounded-pill bg-surface-card px-2 py-[2px]">
              <Text className="text-caption text-muted">{log.matched_keyword}</Text>
            </View>
          ) : null}
          <View className={cn('rounded-pill px-2 py-[2px]', meta.bg)}>
            <Text className={cn('text-caption font-semibold', meta.text)}>
              {meta.label}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

export default function AutomationDetail() {
  const { automationId } = useLocalSearchParams<{ automationId: string }>();
  const router = useRouter();
  const { automations, toggleStatus, deleteAutomation } = useAutomations();
  const { logs, loading, error, refresh } = useAutomationLogs(automationId ?? '');

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
    ? (STATUS_META[automation.status] ?? { bg: 'bg-surface-card', text: 'text-muted' })
    : { bg: 'bg-surface-card', text: 'text-muted' };

  const isPaused = automation?.status === 'paused';

  // Loading state
  if (loading && !automation) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-4">
        <Text className="text-body-md text-muted">Loading automation...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-4">
        <Text className="text-center text-body-sm text-error">{error}</Text>
        <ClayAnimatedButton variant="secondary" onPress={refresh}>
          Retry
        </ClayAnimatedButton>
      </View>
    );
  }

  // Not found state
  if (!automation) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-4">
        <Text className="text-center text-body-md text-muted">
          Automation not found
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-canvas">
      {/* Header: back + name + status */}
      <View className="flex-row items-center justify-between border-b border-hairline bg-canvas px-4 py-3">
        <View className="flex-row items-center gap-2 flex-1">
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Text className="text-title-md text-ink">{'<'}</Text>
          </Pressable>
          <Text className="flex-1 text-title-md font-semibold text-ink" numberOfLines={1}>
            {automation.name}
          </Text>
        </View>
        <View className={cn('rounded-pill px-2.5 py-[3px]', statusMeta.bg)}>
          <Text className={cn('text-caption-uppercase font-semibold capitalize', statusMeta.text)}>
            {automation.status}
          </Text>
        </View>
      </View>

      {/* Stats strip */}
      <View className="flex-row items-center justify-around border-b border-hairline bg-canvas px-4 py-3">
        <View className="items-center gap-1">
          <Text className="text-title-sm font-semibold text-ink">{stats.sent}</Text>
          <Text className="text-caption text-muted">Sent</Text>
        </View>
        <View className="items-center gap-1">
          <Text className="text-title-sm font-semibold text-ink">{stats.skipped}</Text>
          <Text className="text-caption text-muted">Skipped</Text>
        </View>
        <View className="items-center gap-1">
          <Text className="text-title-sm font-semibold text-ink">{stats.failed}</Text>
          <Text className="text-caption text-muted">Failed</Text>
        </View>
      </View>

      {/* Activity feed */}
      <View className="flex-1">
        <FlatList
          data={logs}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={{ paddingBottom: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View className="gap-3 px-4 py-3">
              {/* Config summary card */}
              <View className="rounded-lg border border-hairline bg-canvas p-4 gap-2">
                <Text className="text-title-sm font-semibold text-ink">Configuration</Text>
                <View className="flex-row justify-between">
                  <Text className="text-body-sm text-muted">Target</Text>
                  <Text className="text-body-sm text-ink">{targetLabel(automation)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-body-sm text-muted">Keywords</Text>
                  <Text className="text-body-sm text-ink" numberOfLines={1} style={{ maxWidth: '60%' }}>
                    {automation.keywords.join(', ')}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-body-sm text-muted">Match mode</Text>
                  <Text className="text-body-sm text-ink capitalize">{automation.match_mode.replace(/_/g, ' ')}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-body-sm text-muted">DM text</Text>
                  <Text className="text-body-sm text-ink" numberOfLines={1} style={{ maxWidth: '60%' }}>
                    {automation.dm_message}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-body-sm text-muted">Public reply</Text>
                  <Text className="text-body-sm text-ink">
                    {automation.public_reply_enabled ? 'On' : 'Off'}
                  </Text>
                </View>
              </View>

              {logs.length > 0 ? (
                <Text className="text-title-sm font-semibold text-ink mt-1">Activity</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-8">
              <Text className="text-center text-body-md text-muted">
                No activity yet — comments will appear here
              </Text>
            </View>
          }
        />
      </View>

      {/* Actions row */}
      <View className="flex-row items-center gap-3 border-t border-hairline bg-canvas px-4 py-3">
        <View className="flex-1">
          <ClayAnimatedButton
            variant="secondary"
            onPress={handlePauseResume}
            fullWidth
          >
            {isPaused ? 'Resume' : 'Pause'}
          </ClayAnimatedButton>
        </View>
        <View className="flex-1">
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
