import React, { useCallback, useEffect } from 'react';
import { FlatList } from 'react-native';
import Animated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { View, Text } from '@/tw';
import { cn } from '@/tw/cn';
import { useThreads } from '@/hooks/useThreads';
import type { DealThread } from '@/lib/types';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ClaySpinner } from '@/components/clay/ClaySpinner';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';

/** Status badge color styling per DESIGN.md §3.3 & §5.4 */
const STATUS_META: Record<string, { bg: string; text: string }> = {
  invited: { bg: 'bg-brand-teal', text: 'text-on-dark' },
  negotiating: { bg: 'bg-brand-ochre', text: 'text-ink' },
  contracted: { bg: 'bg-brand-mint', text: 'text-ink' },
  content_pending: { bg: 'bg-brand-lavender', text: 'text-on-dark' },
  live: { bg: 'bg-brand-mint', text: 'text-ink' },
  completed: { bg: 'bg-surface-card', text: 'text-muted' },
  declined: { bg: 'bg-error', text: 'text-on-dark' },
};

function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '';
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

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center gap-4 bg-canvas p-4">
      <Animated.View style={animatedStyle}>
        <View className="max-w-[320px] items-center gap-4">
          <Text className="text-center text-body-sm text-error">
            {error}
          </Text>
          <ClayAnimatedButton variant="secondary" onPress={onRetry}>
            Retry
          </ClayAnimatedButton>
        </View>
      </Animated.View>
    </View>
  );
}

function ThreadRow({
  thread,
  index,
  onPress,
}: {
  thread: DealThread & { lastMessagePreview: string };
  index: number;
  onPress: () => void;
}) {
  const meta = STATUS_META[thread.status] ?? { bg: 'bg-surface-card', text: 'text-muted' };
  const hasUnread = (thread.unread_count ?? 0) > 0;

  return (
    <View className="mx-4 my-1.5">
      <ClayAnimatedCard onPress={onPress} delay={index * 80}>
        <View className="gap-2">
          {/* Top row: title + unread badge + timestamp */}
          <View className="flex-row items-center justify-between">
            <View className="flex-1 flex-row items-center gap-2">
              <Text
                className="flex-1 text-title-sm font-semibold text-ink"
                numberOfLines={1}
              >
                {thread.campaign_title}
              </Text>
              {hasUnread && (
                <Text className="min-w-[22px] h-[22px] leading-[22px] rounded-pill bg-error px-1.5 text-center text-caption font-semibold text-on-primary">
                  {thread.unread_count > 99 ? '99+' : thread.unread_count}
                </Text>
              )}
            </View>
            <Text className="ml-2 text-caption text-muted-soft">
              {formatTimestamp(thread.last_message_at)}
            </Text>
          </View>

          {/* Preview text */}
          <Text className="text-body-sm text-muted" numberOfLines={2}>
            {thread.lastMessagePreview || 'No messages yet'}
          </Text>

          {/* Bottom row: status chip + agent */}
          <View className="mt-1 flex-row items-center justify-between">
            <View className={cn('rounded-pill px-2.5 py-1', meta.bg)}>
              <Text className={cn('text-caption-uppercase font-semibold', meta.text)}>
                {thread.status.replace(/_/g, ' ')}
              </Text>
            </View>
            {thread.agent_assigned && (
              <Text className="text-caption text-muted-soft">
                {thread.agent_assigned}
              </Text>
            )}
          </View>
        </View>
      </ClayAnimatedCard>
    </View>
  );
}

export default function MessagesScreen() {
  const { threads, loading, error, refresh } = useThreads();
  const router = useRouter();

  const handlePress = useCallback(
    (thread: DealThread) => {
      router.push(`/(tabs)/(messages)/${thread.$id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DealThread & { lastMessagePreview: string }; index: number }) => (
      <ThreadRow thread={item} index={index} onPress={() => handlePress(item)} />
    ),
    [handlePress]
  );

  const keyExtractor = useCallback(
    (item: DealThread & { lastMessagePreview: string }) => item.$id ?? item.thread_id,
    []
  );

  // Loading state
  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas">
        <ClaySpinner size={40} label="Loading threads..." />
      </View>
    );
  }

  // Error state
  if (error) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  // Empty state
  if (threads.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-canvas p-4">
        <Text className="text-center text-body-sm text-muted">
          No deal threads yet — your agent will start outreach soon
        </Text>
      </View>
    );
  }

  // Threads list
  return (
    <View className="flex-1 bg-canvas">
      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{ paddingVertical: 8 }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
