import React, { useEffect, useState, useCallback, useRef } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, TouchableOpacity } from 'react-native';
import Animated, { Reanimated } from '@/lib/reanimated-platform';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Text, TextInput } from '@/tw';
import { cn, clayInput } from '@/tw/cn';
import { ClayAnimatedButton } from '@/components/clay/ClayAnimatedButton';
import { useShakeAnimation } from '@/hooks/useClayAnimations';
import { useMessages } from '@/hooks/useMessages';
import { tablesDB } from '@/lib/appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import type { DealThread, Message } from '@/lib/types';
import { TAB_BAR_OVERLAY } from '@/components/screen-shell';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Status chip colors per DESIGN.md §3.3 & §5.4 */
const STATUS_META: Record<string, { bg: string; text: string }> = {
  invited: { bg: 'bg-brand-teal', text: 'text-on-dark' },
  negotiating: { bg: 'bg-brand-ochre', text: 'text-ink' },
  contracted: { bg: 'bg-brand-mint', text: 'text-ink' },
  content_pending: { bg: 'bg-brand-lavender', text: 'text-on-dark' },
  live: { bg: 'bg-brand-mint', text: 'text-ink' },
  completed: { bg: 'bg-surface-card', text: 'text-muted' },
  declined: { bg: 'bg-error', text: 'text-on-dark' },
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

function MessageBubble({ message }: { message: Message }) {
  const isCreator = message.sender_type === 'creator';
  const isSystem = message.sender_type === 'system';

  if (isSystem) {
    return (
      <View className="my-2 items-center px-4">
        <Text className="text-center text-caption italic text-muted">
          {message.body}
        </Text>
        <Text className="mt-1 text-caption text-muted-soft">
          {formatRelativeTime(message.timestamp)}
        </Text>
      </View>
    );
  }

  return (
    <Reanimated.View entering={Reanimated.SlideInUp as any}>
      <View
        className={cn(
          'my-1 px-4',
          isCreator ? 'items-end' : 'items-start',
        )}
      >
        {!isCreator && message.agent_name ? (
          <Text className="mb-0.5 ml-1 text-caption text-muted">
            {message.agent_name}
          </Text>
        ) : null}
        <View
          className={cn(
            'max-w-[80%] rounded-lg p-3 py-2',
            isCreator ? 'bg-brand-teal' : 'bg-surface-card',
          )}
        >
          <Text
            className={cn(
              'text-body-md leading-[22px]',
              isCreator ? 'text-on-dark' : 'text-ink',
            )}
          >
            {message.body}
          </Text>
        </View>
        <Text className="mx-1 mt-0.5 text-caption text-muted-soft">
          {formatRelativeTime(message.timestamp)}
        </Text>
      </View>
    </Reanimated.View>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  const { shake, animatedStyle } = useShakeAnimation();

  useEffect(() => {
    shake();
  }, [shake]);

  return (
    <View className="flex-1 items-center justify-center bg-canvas p-4">
      <Reanimated.View style={animatedStyle}>
        <View className="items-center gap-4 p-4">
          <Text className="text-center text-body-sm text-error">
            {error}
          </Text>
          <ClayAnimatedButton variant="secondary" onPress={onRetry}>
            Retry
          </ClayAnimatedButton>
        </View>
    </Reanimated.View>
    </View>
  );
}

export default function ThreadDetail() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { messages, loading, error, sendMessage, markAsRead, refresh } = useMessages(threadId ?? '');
  const [thread, setThread] = useState<DealThread | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  // Fetch thread details (campaign_title, agent_assigned, status)
  useEffect(() => {
    if (!threadId) return;
    (async () => {
      try {
        const result = await tablesDB.getRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.DEAL_THREADS,
          rowId: threadId,
        });
        setThread(result as unknown as DealThread);
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

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} />,
    [],
  );

  const keyExtractor = useCallback(
    (item: Message) => item.$id ?? item.message_id,
    [],
  );

  // Loading state — skeleton thread, not a spinner wall
  if (loading) {
    return (
      <View className="flex-1 bg-canvas p-4" style={{ gap: 10 }}>
        <View className="self-start bg-white border border-hairline" style={{ height: 44, width: '70%', borderRadius: 14 }} />
        <View className="self-end bg-white border border-hairline" style={{ height: 44, width: '55%', borderRadius: 14 }} />
        <View className="self-start bg-white border border-hairline" style={{ height: 56, width: '65%', borderRadius: 14 }} />
      </View>
    );
  }

  // Error state — shake animation + retry
  if (error) {
    return <ErrorState error={error} onRetry={refresh} />;
  }

  // Empty state — no messages in this thread yet
  if (messages.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-canvas p-4">
        <Text className="text-center text-body-md text-muted">
          No messages yet — start the conversation
        </Text>
      </View>
    );
  }

  const meta = thread
    ? (STATUS_META[thread.status] ?? { bg: 'bg-surface-card', text: 'text-muted' })
    : { bg: 'bg-surface-card', text: 'text-muted' };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View className="flex-1 bg-canvas">
        {/* Header: back, campaign_title, agent_assigned, status chip */}
        <View
          className="flex-row items-center justify-between border-b border-hairline bg-canvas px-4 py-3"
          style={{ paddingTop: insets.top + 12 }}
        >
          <TouchableOpacity
            onPress={() => router.back()}
            accessibilityLabel="Back"
            style={{ width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }}
          >
            <Ionicons name="chevron-back" size={24} color="#0a0a0a" />
          </TouchableOpacity>
          <View className="flex-1 gap-1">
            <Text className="text-title-md font-semibold text-ink" numberOfLines={1}>
              {thread?.campaign_title ?? 'Thread'}
            </Text>
            {thread?.agent_assigned ? (
              <Text className="text-body-sm text-muted">
                {thread.agent_assigned}
              </Text>
            ) : null}
          </View>
          {thread ? (
            <View className={cn('rounded-pill px-2.5 py-[3px]', meta.bg)}>
              <Text className={cn('text-caption-uppercase font-semibold capitalize', meta.text)}>
                {thread.status.replace(/_/g, ' ')}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Message list — inverted for chat-style scrolling */}
        <View className="flex-1">
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            inverted={true}
            contentContainerStyle={{ paddingVertical: 12 }}
            showsVerticalScrollIndicator={false}
          />
        </View>

        {/* Input bar */}
        <View
          className="flex-row items-center gap-2 border-t border-hairline bg-canvas px-4 py-2"
          style={{ paddingBottom: insets.bottom + TAB_BAR_OVERLAY }}
        >
          <TextInput
            placeholder="Type a message..."
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={handleSend}
            returnKeyType="send"
            className={cn(clayInput, 'h-11 flex-1 px-3')}
          />
          <ClayAnimatedButton
            variant="primary"
            onPress={handleSend}
            loading={sending}
            disabled={!inputText.trim() || sending}
          >
            Send
          </ClayAnimatedButton>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
