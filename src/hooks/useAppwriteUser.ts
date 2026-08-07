import { useQuery } from '@tanstack/react-query';
import { account } from '@/lib/appwrite';
import { addLog } from '@/lib/logger';

export function useAppwriteUser(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['appwrite-user'],
    queryFn: async () => {
      try {
        return await account.get();
      } catch (err: unknown) {
        addLog(
          `[useAppwriteUser] not authenticated: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
      }
    },
    select: (data) => data ?? null,
    enabled: options?.enabled !== false,
    retry: false,
    staleTime: Infinity,
  });
}
