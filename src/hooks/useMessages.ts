import { useState, useEffect, useCallback } from 'react';
import { tablesDB } from '@/lib/appwrite';
import { Query, ID, Channel } from 'appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import type { Message } from '@/lib/types';
import { useRealtimeSubscription } from '@/lib/realtime';

interface UseMessagesResult {
  messages: Message[];
  loading: boolean;
  error: string | null;
  sendMessage: (text: string, isAskAgent?: boolean, agentAssigned?: string) => Promise<void>;
  markAsRead: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useMessages(threadId: string): UseMessagesResult {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async () => {
    if (!threadId) {
      setLoading(false);
      return;
    }

    setMessages([]);
    setLoading(true);
    setError(null);

    try {
      const result = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MESSAGES,
        queries: [
          Query.equal('thread_id', threadId),
          Query.orderAsc('timestamp'),
        ],
      });

      const rawMessages = result.rows as unknown as Message[];
      setMessages(rawMessages);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Failed to load messages');
    } finally {
      setLoading(false);
    }
  }, [threadId]);

  const sendMessage = useCallback(
    async (text: string, isAskAgent = false, agentAssigned?: string) => {
      if (!text.trim()) return;

      try {
        const newMessage = await tablesDB.createRow({
          databaseId: DATABASE_ID,
          tableId: TABLES.MESSAGES,
          rowId: ID.unique(),
          data: {
            thread_id: threadId,
            sender_type: 'creator',
            body: text,
            attachments: '[]',
            agent_name: isAskAgent && agentAssigned ? agentAssigned : '',
            is_read: false,
            timestamp: new Date().toISOString(),
          },
        });

        setMessages((prev) => [...prev, newMessage as unknown as Message]);
      } catch (err: unknown) {
        const apiErr = err as { message?: string };
        throw new Error(apiErr.message ?? 'Failed to send message');
      }
    },
    [threadId]
  );

  const markAsRead = useCallback(async () => {
    if (!threadId) return;

    try {
      const unreadMessages = messages.filter((msg) => !msg.is_read);
      if (unreadMessages.length === 0) return;

      await Promise.all(
        unreadMessages.map((msg) =>
          tablesDB.updateRow({
            databaseId: DATABASE_ID,
            tableId: TABLES.MESSAGES,
            rowId: msg.$id!,
            data: { is_read: true },
          })
        )
      );

      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.DEAL_THREADS,
        rowId: threadId,
        data: { unread_count: 0 },
      });

      setMessages((prev) => prev.map((msg) => ({ ...msg, is_read: true })));
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      throw new Error(apiErr.message ?? 'Failed to mark messages as read');
    }
  }, [threadId, messages]);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  const messagesChannel = Channel.tablesdb(DATABASE_ID)
    .table(TABLES.MESSAGES)
    .row()
    .create();

  useRealtimeSubscription(messagesChannel.toString(), (event) => {
    const newMessage = event.payload as unknown as Message;
    if (newMessage.thread_id === threadId) {
      setMessages((prev) =>
        prev.some((m) => m.$id === newMessage.$id) ? prev : [...prev, newMessage]
      );
    }
  });

  return { messages, loading, error, sendMessage, markAsRead, refresh: fetchMessages };
}
