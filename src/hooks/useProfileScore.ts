import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import {
  generateProfileScore,
  getLatestProfileScore,
  type ProfileReport,
  type ProfileScoreResult,
} from '@/lib/profile-score';

function toScreenError(message: string | undefined): string | null {
  if (message === 'session_expired') return 'session_expired';
  return message ?? null;
}

export function useLatestScore(options?: { enabled?: boolean }) {
  const { data: user } = useAppwriteUser();
  const enabled = options?.enabled !== false;

  const query = useQuery({
    queryKey: ['profile-score', user?.$id, 'latest'],
    enabled: !!user && enabled,
    queryFn: () => getLatestProfileScore(),
  });

  const result: ProfileScoreResult | null = query.data ?? null;
  const report: ProfileReport | null = result?.report ?? null;

  return {
    result,
    report,
    meta: result?.meta ?? null,
    loading: query.isLoading,
    error: toScreenError(query.error?.message),
    refresh: query.refetch,
  };
}

export function useGenerateScore() {
  const { data: user } = useAppwriteUser();
  const queryClient = useQueryClient();

  const generate = useMutation({
    mutationFn: () => generateProfileScore(),
    onSuccess: async (result) => {
      queryClient.setQueryData(['profile-score', user?.$id, 'latest'], result);
      await queryClient.invalidateQueries({ queryKey: ['profile-score'] });
    },
  });

  return {
    generate: generate.mutateAsync,
    generating: generate.isPending,
    error: toScreenError(generate.error?.message),
  };
}
