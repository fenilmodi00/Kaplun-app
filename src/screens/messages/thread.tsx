import React, { useEffect, useState, useCallback } from 'react';
import { KeyboardAvoidingView } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, useCSSVariable } from '@/tw';
import {
  Badge,
  Button,
  EmptyState,
  Input,
  Marker,
  Message,
  MessageScroller,
  Skeleton,
  Text,
} from 'panelui-native';
import { useMessages } from '@/hooks/useMessages';
import { getThreadById } from '@/lib/repository';
import { formatRelativeTime } from '@/lib/format-time';
import type { DealThread, Message as ThreadMessageData } from '@/lib/types';
import { TAB_BAR_OVERLAY } from '@/components/screen-shell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type BadgeVariant = React.ComponentProps<typeof Badge>['variant'];

/** Deal status → Badge variant (same mapping as the messages list screen). */
const STATUS_VARIANT: Record<string, BadgeVariant> = {
  invited: 'info',
  negotiating: 'warning',
  contracted: 'success',
  content_pending: 'default',
  live: 'success',
  completed: 'secondary',
  declined: 'destructive',
};

function MessageBubble({ message }: { message: ThreadMessageData }) {
  if (message.sender_type === 'system') {
    return (
      <View className="items-center gap-0.5 py-1">
        <Marker>
          <Marker.Content className="italic">{message.body}</Marker.Content>
        </Marker>
        <Text size="xs" muted>
          {formatRelativeTime(message.timestamp)}
        </Text>
      </View>
    );
  }

  const isCreator = message.sender_type === 'creator';

  return (
    <Message align={isCreator ? 'end' : 'start'}>
      <Message.Content>
        {!isCreator && message.agent_name ? (
          <Message.Header>{message.agent_name}</Message.Header>
        ) : null}
        <Message.Bubble>
          <Message.BubbleContent>{message.body}</Message.BubbleContent>
        </Message.Bubble>
        <Message.Footer>{formatRelativeTime(message.timestamp)}</Message.Footer>
      </Message.Content>
    </Message>
  );
}

export default function ThreadScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const foreground = useCSSVariable('--color-foreground') as string;
  const { messages, loading, error, sendMessage, markAsRead, refresh } = useMessages(threadId ?? '');
  const [thread, setThread] = useState<DealThread | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);

  // Fetch thread details (campaign_title, agent_assigned, status)
  useEffect(() => {
    if (!threadId) return;
    (async () => {
      try {
        setThread(await getThreadById(threadId));
      } catch {
        // Thread details are not critical for rendering messages
      }
    })();
  }, [threadId]);

  // Mark all messages as read on mount
  useEffect(() => {
    if (threadId) {
      markAsRead();
    }
  }, [threadId, markAsRead]);

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendMessage(text);
      setInputText('');
    } catch {
      // Error is surfaced by the hook
    } finally {
      setSending(false);
    }
  }, [inputText, sending, sendMessage]);

  // Loading state — skeleton thread, not a spinner wall
  if (loading) {
    return (
      <View className="flex-1 gap-2.5 bg-background p-4">
        <Skeleton className="h-11 w-[70%] self-start rounded-xl" />
        <Skeleton className="h-11 w-[55%] self-end rounded-xl" />
        <Skeleton className="h-14 w-[65%] self-start rounded-xl" />
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
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
      </View>
    );
  }

  // Empty state — no messages in this thread yet
  if (messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background p-4">
        <EmptyState>
          <EmptyState.Header>
            <EmptyState.Title>No messages yet</EmptyState.Title>
            <EmptyState.Description>Start the conversation.</EmptyState.Description>
          </EmptyState.Header>
        </EmptyState>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View className="flex-1 bg-background">
        {/* Header: back, campaign_title, agent_assigned, status badge */}
        <View
          className="flex-row items-center justify-between border-b border-border bg-background px-4 py-3"
          style={{ paddingTop: insets.top + 12 }}
        >
          <Button
            size="icon"
            variant="ghost"
            onPress={() => router.back()}
            accessibilityLabel="Back"
          >
            <Ionicons name="chevron-back" size={24} color={foreground} />
          </Button>
          <View className="flex-1 gap-1 px-1">
            <Text size="lg" weight="semibold" numberOfLines={1}>
              {thread?.campaign_title ?? 'Thread'}
            </Text>
            {thread?.agent_assigned ? (
              <Text size="sm" muted>
                {thread.agent_assigned}
              </Text>
            ) : null}
          </View>
          {thread ? (
            <Badge variant={STATUS_VARIANT[thread.status] ?? 'secondary'}>
              {thread.status.replace(/_/g, ' ')}
            </Badge>
          ) : null}
        </View>

        {/* Transcript — MessageScroller owns open-at-end + follow-new + prepend preservation */}
        <MessageScroller autoScroll className="flex-1">
          <MessageScroller.Viewport>
            <MessageScroller.Content>
              {messages.map((message) => (
                <MessageScroller.Item
                  key={message.$id ?? message.message_id}
                  messageId={message.$id ?? message.message_id}
                >
                  <MessageBubble message={message} />
                </MessageScroller.Item>
              ))}
            </MessageScroller.Content>
          </MessageScroller.Viewport>
          <MessageScroller.Button />
        </MessageScroller>

        {/* Input bar */}
        <View
          className="flex-row items-center gap-2 border-t border-border bg-background px-4 py-2"
          style={{ paddingBottom: insets.bottom + TAB_BAR_OVERLAY }}
        >
          <Input
            containerClassName="flex-1"
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Button onPress={handleSend} loading={sending} disabled={!inputText.trim() || sending}>
            Send
          </Button>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
