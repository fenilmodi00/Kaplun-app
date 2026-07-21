import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@clerk/clerk-expo';
import { tablesDB } from '@/lib/appwrite';
import { Query } from 'appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
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
  refresh: () => Promise<void>;
}

export function useDashboard(): UseDashboardResult {
  const { user } = useUser();
  const clerkUserId = user?.id ?? '';
  const [data, setData] = useState<DashboardData>({
    creator: null,
    threads: [],
    deals: [],
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
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
        setData({ creator: null, threads: [], deals: [] });
        setLoading(false);
        return;
      }

      const creator = creatorsResult.rows[0] as unknown as Creator;
      const igUserId = creator.ig_user_id;

      if (!igUserId) {
        setData({ creator, threads: [], deals: [] });
        setLoading(false);
        return;
      }

      // Step 2: Fetch active deal threads (exclude completed and declined)
      const threadsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.DEAL_THREADS,
        queries: [
          Query.equal('ig_user_id', igUserId),
          Query.notEqual('status', 'completed'),
          Query.notEqual('status', 'declined'),
          Query.orderDesc('last_message_at'),
        ],
      });

      const threads = threadsResult.rows as unknown as DealThread[];

      // Step 3: Batch fetch deals for all active threads
      let deals: Deal[] = [];
      if (threads.length > 0) {
        const threadIds = threads
          .map((t) => t.$id)
          .filter((id): id is string => id != null);

        if (threadIds.length > 0) {
          try {
            const dealsResult = await tablesDB.listRows({
              databaseId: DATABASE_ID,
              tableId: TABLES.DEALS,
              queries: [Query.equal('thread_id', threadIds)],
            });
            deals = dealsResult.rows as unknown as Deal[];
          } catch {
            // Deals table may be empty; continue without deals
          }
        }
      }

      setData({ creator, threads, deals });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, [clerkUserId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  return { data, loading, error, refresh: fetchDashboard };
}
