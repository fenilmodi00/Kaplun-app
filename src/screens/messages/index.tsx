import React, { useCallback } from 'react';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { View, Text } from '@/tw';
import { ScreenShell, useScreenContentPadding } from '@/components/screen-shell';
import { cn } from '@/tw/cn';
import { useThreads } from '@/hooks/useThreads';
import type { DealThread } from '@/lib/types';
import { ClayAnimatedCard } from '@/components/clay/ClayAnimatedCard';
import { ErrorState } from '@/components/ui/error-state';
import { formatRelativeTime as formatTimestamp } from '@/lib/format-time';

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
  const insets = useSafeAreaInsets();
  const padding = useScreenContentPadding();

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

  // Loading state — skeleton list, not a lag spinner wall
  if (loading) {
    return (
      <ScreenShell>
        <View className="bg-canvas p-4" style={{ gap: 10 }}>
          <View className="bg-white border border-hairline" style={{ height: 72, borderRadius: 14 }} />
          <View className="bg-white border border-hairline" style={{ height: 72, borderRadius: 14 }} />
          <View className="bg-white border border-hairline" style={{ height: 72, borderRadius: 14 }} />
        </View>
      </ScreenShell>
    );
  }

  // Error state
  if (error) {
    return (
      <ScreenShell center>
        <ErrorState error={error} onRetry={refresh} />
      </ScreenShell>
    );
  }

  // Empty state
  if (threads.length === 0) {
    return (
      <ScreenShell center>
        <Text className="text-center text-body-sm text-muted">
          No deal threads yet — your agent will start outreach soon
        </Text>
      </ScreenShell>
    );
  }

  // Threads list
  return (
    <View className="flex-1 bg-canvas">
      {/* In-screen header */}
      <View
        className="px-4 pb-2"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text
          className="font-semibold text-ink"
          style={{ fontSize: 21, letterSpacing: -0.4 }}
        >
          Messages
        </Text>
      </View>
      <FlatList
        data={threads}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={{
          paddingVertical: 8,
          paddingBottom: insets.bottom + 110,
        }}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}
