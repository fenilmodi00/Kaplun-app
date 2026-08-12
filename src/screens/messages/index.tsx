import React, { useCallback } from 'react';
import { FlatList } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { View } from '@/tw';
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Item,
  Skeleton,
  Text,
} from 'panelui-native';
import { ScreenShell } from '@/components/screen-shell';
import { useThreads } from '@/hooks/useThreads';
import type { DealThread } from '@/lib/types';
import { formatRelativeTime as formatTimestamp } from '@/lib/format-time';

type ThreadListItem = DealThread & { lastMessagePreview: string };
type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

/** Deal status → Badge variant (replaces DESIGN.md §3.3/§5.4 STATUS_META palette). */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  invited: 'info',
  negotiating: 'warning',
  contracted: 'success',
  content_pending: 'default',
  live: 'success',
  completed: 'secondary',
  declined: 'destructive',
};

function ThreadRow({
  thread,
  onPress,
}: {
  thread: ThreadListItem;
  onPress: () => void;
}) {
  const unread = thread.unread_count ?? 0;

  return (
    <Item variant="outline" onPress={onPress} className="mx-4 my-1.5">
      <Item.Media>
        <Avatar fallback={thread.campaign_title.slice(0, 2).toUpperCase()} />
      </Item.Media>
      <Item.Content className="gap-1.5">
        {/* Top row: title + unread badge + timestamp */}
        <View className="flex-row items-center justify-between">
          <View className="flex-1 flex-row items-center gap-2">
            <Item.Title numberOfLines={1} className="flex-1">
              {thread.campaign_title}
            </Item.Title>
            {unread > 0 && <Badge variant="destructive" count={unread} />}
          </View>
          <Text size="xs" muted className="ml-2">
            {formatTimestamp(thread.last_message_at)}
          </Text>
        </View>

        {/* Preview text */}
        <Item.Description numberOfLines={2}>
          {thread.lastMessagePreview || 'No messages yet'}
        </Item.Description>

        {/* Bottom row: status chip + agent */}
        <View className="mt-1 flex-row items-center justify-between">
          <Badge variant={STATUS_VARIANT[thread.status] ?? 'secondary'}>
            {thread.status.replace(/_/g, ' ')}
          </Badge>
          {thread.agent_assigned && (
            <Text size="xs" muted>
              {thread.agent_assigned}
            </Text>
          )}
        </View>
      </Item.Content>
    </Item>
  );
}

export default function MessagesScreen() {
  const { threads, loading, error, refresh } = useThreads();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handlePress = useCallback(
    (thread: DealThread) => {
      router.push(`/(tabs)/(messages)/${thread.$id}`);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: ThreadListItem }) => (
      <ThreadRow thread={item} onPress={() => handlePress(item)} />
    ),
    [handlePress]
  );

  const keyExtractor = useCallback(
    (item: ThreadListItem) => item.$id ?? item.thread_id,
    []
  );

  // Loading state — skeleton list, not a lag spinner wall
  if (loading) {
    return (
      <ScreenShell>
        <View className="gap-2.5 p-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </View>
      </ScreenShell>
    );
  }

  // Error state
  if (error) {
    return (
      <ScreenShell center>
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>Couldn't load messages</EmptyState.Title>
            <EmptyState.Description>{error}</EmptyState.Description>
          </EmptyState.Header>
          <EmptyState.Content>
            <Button variant="outline" onPress={refresh}>
              Retry
            </Button>
          </EmptyState.Content>
        </EmptyState>
      </ScreenShell>
    );
  }

  // Empty state
  if (threads.length === 0) {
    return (
      <ScreenShell center>
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>No deal threads yet</EmptyState.Title>
            <EmptyState.Description>
              Your agent will start outreach soon.
            </EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      </ScreenShell>
    );
  }

  // Threads list
  return (
    <View className="flex-1 bg-background">
      {/* In-screen header */}
      <View
        className="px-4 pb-2"
        style={{ paddingTop: insets.top + 12 }}
      >
        <Text size="xl" weight="semibold" className="tracking-tight">
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
        onRefresh={refresh}
        refreshing={loading}
      />
    </View>
  );
}
