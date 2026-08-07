import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Channel } from 'appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import { getCreatorByClerkId, listThreads, getLastMessagePreviews } from '@/lib/repository';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useRealtimeSubscription } from '@/lib/realtime';
import { useBridge } from '@/lib/bridge-context';
import type { DealThread } from '@/lib/types';

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
  const { data: user } = useAppwriteUser();
  const appwriteUserId = user?.$id ?? '';
  const queryClient = useQueryClient();
  const { isReady } = useBridge();

  const {
    data: threads = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['threads', appwriteUserId],
    queryFn: async (): Promise<ThreadWithPreview[]> => {
      if (!appwriteUserId) return [];

      const creator = await getCreatorByClerkId(appwriteUserId);
      if (!creator) return [];

      const igUserId = creator.ig_user_id as string;
      if (!igUserId) return [];

      const rawThreads = await listThreads(igUserId);

      const threadIds = rawThreads.map((t) => t.$id ?? '').filter(Boolean);
      const previews = threadIds.length > 0 ? await getLastMessagePreviews(threadIds) : new Map<string, string>();

      return rawThreads.map((thread) => ({
        ...thread,
        lastMessagePreview: previews.get(thread.$id ?? '') ?? '',
      }));
    },
    enabled: !!appwriteUserId && isReady,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const dealThreadsChannel = Channel.tablesdb(DATABASE_ID).table(TABLES.DEAL_THREADS).row();
  useRealtimeSubscription(dealThreadsChannel.toString(), () => {
    queryClient.invalidateQueries({ queryKey: ['threads', appwriteUserId] });
  });

  const errorMessage = useMemo(() => {
    if (!isError || !error) return null;
    return error instanceof Error ? error.message : 'Failed to load threads';
  }, [isError, error]);

  return {
    threads,
    loading: !isReady || isLoading,
    error: errorMessage,
    refresh: () => refetch().then(() => {}),
  };
}
