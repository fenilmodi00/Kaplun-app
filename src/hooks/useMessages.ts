import { useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Channel } from 'appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import { listMessages, sendMessage as repositorySendMessage, batchMarkAsRead } from '@/lib/repository';
import { useRealtimeSubscription } from '@/lib/realtime';
import { useBridge } from '@/lib/bridge-context';
import type { Message } from '@/lib/types';

interface UseMessagesResult {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string, isAskAgent?: boolean, agentAssigned?: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMessages(threadId: string): UseMessagesResult {
  const queryClient = useQueryClient();
  const { isReady } = useBridge();

  const {
    data: messages = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['messages', threadId],
    queryFn: () => listMessages(threadId),
    enabled: !!threadId && isReady,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({
      text,
      isAskAgent,
      agentAssigned,
    }: {
      text: string;
      isAskAgent?: boolean;
      agentAssigned?: string;
    }) => {
      return repositorySendMessage(threadId, text, { isAskAgent, agentAssigned });
    },
    onSuccess: (newMessage) => {
      queryClient.setQueryData<Message[]>(['messages', threadId], (prev = []) => [
        ...prev,
        newMessage,
      ]);
    },
  });

  const markAsReadMutation = useMutation({
    mutationFn: async () => {
      const unreadIds = messages.filter((msg) => !msg.is_read).map((msg) => msg.$id!);
      if (unreadIds.length === 0) return;
      return batchMarkAsRead(threadId, unreadIds);
    },
    onSuccess: (succeeded) => {
      if (!succeeded) return;
      queryClient.setQueryData<Message[]>(['messages', threadId], (prev = []) =>
        prev.map((msg) =>
          msg.$id && succeeded.has(msg.$id) ? { ...msg, is_read: true } : msg,
        ),
      );
    },
  });

  const sendMessage = useCallback(
    async (text: string, isAskAgent = false, agentAssigned?: string) => {
      if (!text.trim()) return;
      await sendMessageMutation.mutateAsync({ text, isAskAgent, agentAssigned });
    },
    [sendMessageMutation],
  );

  const markAsRead = useCallback(async () => {
    if (!threadId) return;
    await markAsReadMutation.mutateAsync();
  }, [threadId, markAsReadMutation]);

  const messagesChannel = Channel.tablesdb(DATABASE_ID)
    .table(TABLES.MESSAGES)
    .row()
    .create();

  useRealtimeSubscription(messagesChannel.toString(), (event) => {
    const newMessage = event.payload as unknown as Message;
    if (newMessage.thread_id === threadId) {
      queryClient.setQueryData<Message[]>(['messages', threadId], (prev = []) =>
        prev.some((m) => m.$id === newMessage.$id) ? prev : [...prev, newMessage],
      );
    }
  });

  const errorMessage = useMemo(() => {
    if (!isError || !error) return null;
    return error instanceof Error ? error.message : 'Failed to load messages';
  }, [isError, error]);

  return {
    messages,
    loading: !isReady || isLoading,
    error: errorMessage,
    sendMessage,
    markAsRead,
    refresh: () => refetch().then(() => {}),
  };
}
