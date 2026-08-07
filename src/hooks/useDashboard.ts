import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCreatorByClerkId, listThreads, listDeals } from '@/lib/repository';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useBridge } from '@/lib/bridge-context';
import type { Creator, DealThread, Deal } from '@/lib/types';

interface DashboardData {
  creator: Creator | null;
  threads: DealThread[];
  deals: Deal[];
}

interface UseDashboardResult {
  data: DashboardData;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>; // kept for backward compat — useQuery auto-refetches
}

export function useDashboard(): UseDashboardResult {
  const { data: user } = useAppwriteUser();
  const appwriteUserId = user?.$id ?? '';
  const { isReady } = useBridge();

  const {
    data = { creator: null, threads: [], deals: [] },
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['dashboard', appwriteUserId],
    queryFn: async (): Promise<DashboardData> => {
      if (!appwriteUserId) return { creator: null, threads: [], deals: [] };

      const creator = await getCreatorByClerkId(appwriteUserId);
      if (!creator) return { creator: null, threads: [], deals: [] };

      const igUserId = creator.ig_user_id;
      if (!igUserId) return { creator, threads: [], deals: [] };

      const threads = await listThreads(igUserId, {
        excludeStatuses: ['completed', 'declined'],
      });

      const threadIds = threads.map((t) => t.$id).filter(Boolean) as string[];
      const deals = threadIds.length > 0 ? await listDeals(threadIds) : [];

      return { creator, threads, deals };
    },
    enabled: !!appwriteUserId && isReady,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  const errorMessage = useMemo(() => {
    if (!isError || !error) return null;
    return error instanceof Error ? error.message : 'Failed to load dashboard';
  }, [isError, error]);

  // Treat bridge-pending as loading so screens show skeletons, not empty states.
  return {
    data,
    loading: !isReady || isLoading,
    error: errorMessage,
    refresh: () => refetch().then(() => {}),
  };
}
