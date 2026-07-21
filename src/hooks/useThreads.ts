import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { tablesDB } from '@/lib/appwrite';
import { Query, Channel } from 'appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import type { DealThread, Message } from '@/lib/types';
import { useRealtimeSubscription } from '@/lib/realtime';

interface ThreadWithPreview extends DealThread {
  lastMessagePreview: string;
}

interface UseThreadsResult {
  threads: ThreadWithPreview[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useThreads(): UseThreadsResult {
  const { user } = useUser();
  const clerkUserId = user?.id ?? '';
  const [threads, setThreads] = useState<ThreadWithPreview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!clerkUserId) return;
    setLoading(true);
    setError(null);

    try {
      const creatorsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.CREATORS,
        queries: [Query.equal('clerk_user_id', clerkUserId), Query.limit(1)],
      });

      if (creatorsResult.rows.length === 0) {
        setThreads([]);
        setLoading(false);
        return;
      }

      const creatorRow = creatorsResult.rows[0];
      const igUserId = creatorRow.ig_user_id as string;

      if (!igUserId) {
        setThreads([]);
        setLoading(false);
        return;
      }

      // Step 2: Fetch deal_threads for this ig_user_id
      const threadsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.DEAL_THREADS,
        queries: [
          Query.equal('ig_user_id', igUserId),
          Query.orderDesc('last_message_at'),
        ],
      });

      const rawThreads = threadsResult.rows as unknown as DealThread[];

      // Step 3: Batch-fetch last message preview for all threads (single query)
      const threadIds = rawThreads.map((t) => t.$id ?? '').filter(Boolean);
      let lastMessageByThread = new Map<string, string>();

      if (threadIds.length > 0) {
        const messagesResult = await tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: TABLES.MESSAGES,
          queries: [
            Query.equal('thread_id', threadIds),
            Query.orderDesc('timestamp'),
          ],
        });

        const allMessages = messagesResult.rows as unknown as Message[];
        // Dedupe: keep only the first (latest) message per thread_id
        const seen = new Set<string>();
        for (const msg of allMessages) {
          if (!seen.has(msg.thread_id)) {
            seen.add(msg.thread_id);
            lastMessageByThread.set(msg.thread_id, msg.body);
          }
        }
      }

      const threadsWithPreviews = rawThreads.map((thread) => ({
        ...thread,
        lastMessagePreview: lastMessageByThread.get(thread.$id ?? '') ?? '',
      }));

      setThreads(threadsWithPreviews);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Failed to load threads');
    } finally {
      setLoading(false);
    }
  }, [clerkUserId]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const dealThreadsChannel = Channel.tablesdb(DATABASE_ID).table(TABLES.DEAL_THREADS).row();
  useRealtimeSubscription(dealThreadsChannel.toString(), () => {
    fetchThreads();
  });

  return { threads, loading, error, refresh: fetchThreads };
}
