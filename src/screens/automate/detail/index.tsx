/**
 * Automation detail screen — status, stats, config summary, activity feed.
 *
 * PanelUI components (Card, Item, Badge, Switch, Dialog, Alert, EmptyState)
 * on semantic tokens; layout stays on `@/tw` primitives.
 */

import React, { useCallback, useMemo } from 'react';
import { FlatList } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Badge,
  Button,
  Card,
  Dialog,
  EmptyState,
  Switch,
  Text,
} from 'panelui-native';
import { Pressable, View, useCSSVariable } from '@/tw';
import { useAutomations, useAutomationLogs, useAutomationStats } from '@/hooks/useAutomations';
import type { AutomationLog } from '@/lib/automations';
import { TAB_BAR_OVERLAY } from '@/components/screen-shell';
import { computeStats, statusBadgeVariant, targetLabel } from './utils';
import { ConfigRow, LogRow, StatCell } from './components';

function DetailErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <EmptyState>
      <EmptyState.Header>
        <EmptyState.Title>Couldn't load activity</EmptyState.Title>
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

export default function AutomationDetailScreen() {
  const { automationId, created } = useLocalSearchParams<{ automationId: string; created?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useCSSVariable('--color-foreground') as string;
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

  const handleConfirmDelete = useCallback(() => {
    if (!automation) return;
    deleteAutomation(automation.$id);
  }, [automation, deleteAutomation]);

  const renderItem = useCallback(
    ({ item }: { item: AutomationLog }) => <LogRow log={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: AutomationLog) => item.$id ?? `${item.comment_id}-${item.created_at}`,
    [],
  );

  const isPaused = automation?.status === 'paused';

  // Loading state
  if (loading && !automation) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background p-4">
        <Text muted>Loading automation...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return <DetailErrorState error={error} onRetry={refresh} />;
  }

  // Not found state
  if (!automation) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <Text muted>Automation not found</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      {/* Header: back + name + status */}
      <View
        className="flex-row items-center gap-2 border-b border-border bg-background px-2 pb-3"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Pressable
          onPress={() => router.back()}
          accessibilityLabel="Back"
          className="h-10 w-10 items-center justify-center"
        >
          <Ionicons name="chevron-back" size={24} color={foreground} />
        </Pressable>
        <Text size="lg" weight="semibold" numberOfLines={1} className="flex-1">
          {automation.name}
        </Text>
        <Badge variant={statusBadgeVariant(automation.status)} labelClassName="capitalize">
          {automation.status}
        </Badge>
      </View>

      {/* Stats strip */}
      <View className="flex-row items-center justify-around border-b border-border bg-background px-4 py-3">
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
              {/* Post-creation guidance: the engine has no test endpoint, so
                  the honest "test" is to comment on the targeted post and
                  watch the activity feed below. */}
              {created === 'live' && (
                <Alert variant="success">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>You're live!</Alert.Title>
                    <Alert.Description>
                      Test it now: comment{' '}
                      {automation.match_any_word
                        ? 'anything'
                        : `one of your keywords (e.g. "${automation.keywords[0] ?? ''}")`}{' '}
                      on your post — the DM fires automatically and shows up in
                      Activity below.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {created === 'paused' && (
                <Alert variant="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>Saved as paused</Alert.Title>
                    <Alert.Description>
                      Nothing fires while paused. Flip the Active switch in
                      Configuration when you're ready to go live.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

              {/* Config summary card */}
              <Card>
                <Card.Header>
                  <Card.Title>Configuration</Card.Title>
                </Card.Header>
                <Card.Content className="gap-2">
                  <ConfigRow label="Target">
                    <Text size="sm" className="max-w-[60%]">{targetLabel(automation)}</Text>
                  </ConfigRow>
                  <ConfigRow label="Keywords">
                    <Text size="sm" className="max-w-[60%]" numberOfLines={1}>
                      {automation.match_any_word ? 'Any word' : automation.keywords.join(', ')}
                    </Text>
                  </ConfigRow>
                  <ConfigRow label="Match mode">
                    <Text size="sm" className="max-w-[60%] capitalize">
                      {automation.match_mode.replace(/_/g, ' ')}
                    </Text>
                  </ConfigRow>
                  <ConfigRow label="DM text">
                    <Text size="sm" className="max-w-[60%]" numberOfLines={1}>
                      {automation.dm_message}
                    </Text>
                  </ConfigRow>
                  <ConfigRow label="Public reply">
                    <Text size="sm" className="max-w-[60%]">
                      {automation.public_reply_enabled
                        ? `On${replyPool.length > 0 ? ` (${replyPool.length} in pool)` : ''}`
                        : 'Off'}
                    </Text>
                  </ConfigRow>
                  {automation.public_reply_enabled && replyPool.length > 0 && (
                    <View className="gap-0.5 pl-1">
                      {replyPool.map((msg) => (
                        <Text key={msg} size="xs" muted numberOfLines={1}>
                          • {msg}
                        </Text>
                      ))}
                    </View>
                  )}
                  <ConfigRow label="Follow gate">
                    <Text size="sm" className="max-w-[60%]">
                      {automation.require_follow ? 'On' : 'Off'}
                    </Text>
                  </ConfigRow>
                  {automation.require_follow && (
                    <>
                      <ConfigRow label="Prompt message">
                        <Text size="sm" className="max-w-[60%]" numberOfLines={1}>
                          {automation.follow_prompt_message ?? 'Follow me to unlock the link!'}
                        </Text>
                      </ConfigRow>
                      <ConfigRow label="Button label">
                        <Text size="sm" className="max-w-[60%]">
                          {automation.follow_prompt_button_label ?? 'Follow'}
                        </Text>
                      </ConfigRow>
                    </>
                  )}
                  <ConfigRow label="Follow-up">
                    <Text size="sm" className="max-w-[60%]">
                      {automation.follow_up_enabled
                        ? `On${automation.follow_up_delay_minutes ? ` (${automation.follow_up_delay_minutes}m delay)` : ''}`
                        : 'Off'}
                    </Text>
                  </ConfigRow>
                  {automation.follow_up_enabled && automation.follow_up_message && (
                    <ConfigRow label="Follow-up msg">
                      <Text size="sm" className="max-w-[60%]" numberOfLines={1}>
                        {automation.follow_up_message}
                      </Text>
                    </ConfigRow>
                  )}
                  <ConfigRow label="DM trigger">
                    <Text size="sm" className="max-w-[60%]">
                      {automation.dm_trigger_enabled ? 'On' : 'Off'}
                    </Text>
                  </ConfigRow>
                  <View className="flex-row items-center justify-between">
                    <Text size="sm" muted>Active</Text>
                    <Switch value={!isPaused} onValueChange={handlePauseResume} />
                  </View>
                </Card.Content>
              </Card>

              {logs.length > 0 ? (
                <Text weight="semibold" className="mt-1">Activity</Text>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View className="items-center justify-center py-8">
              <Text muted>No activity yet — comments will appear here</Text>
            </View>
          }
        />
      </View>

      {/* Delete action with confirmation */}
      <View
        className="border-t border-border bg-background px-4 pt-3"
        style={{ paddingBottom: insets.bottom + TAB_BAR_OVERLAY }}
      >
        <Dialog>
          <Dialog.Trigger>
            <Button variant="destructive" fullWidth>
              Delete
            </Button>
          </Dialog.Trigger>
          <Dialog.Content>
            <Dialog.Title>Delete Automation</Dialog.Title>
            <Dialog.Description>
              {`Are you sure you want to delete "${automation.name}"? This cannot be undone.`}
            </Dialog.Description>
            <Dialog.Footer>
              <Dialog.Close>
                <Button variant="ghost" size="sm">
                  Cancel
                </Button>
              </Dialog.Close>
              <Dialog.Close>
                <Button
                  variant="destructive"
                  size="sm"
                  onPress={handleConfirmDelete}
                  accessibilityLabel="Confirm delete"
                >
                  Delete
                </Button>
              </Dialog.Close>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog>
      </View>
    </View>
  );
}
