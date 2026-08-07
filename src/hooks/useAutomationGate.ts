// src/hooks/useAutomationGate.ts
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useBridge } from '@/lib/bridge-context';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { addLog } from '@/lib/logger';
import { getCreatorByClerkId } from '@/lib/repository';

function hasUsableInstagramToken(token: string | null | undefined): boolean {
  return !!token;
}

/** Gate: automations need an OAuth-connected IG professional account
 *  (creators.access_token present and usable by the Expo Graph client).
 *  connect() runs the existing OAuth flow. */
export function useAutomationGate() {
  const { data: user } = useAppwriteUser();
  const { isReady } = useBridge();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automationGate', user?.$id],
    enabled: !!user && isReady,
    queryFn: async () => {
      const creator = await getCreatorByClerkId(user!.$id);
      return {
        connected: hasUsableInstagramToken(creator?.access_token),
        appwriteUserId: user!.$id,
      };
    },
  });

  const connect = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    if (!isReady) throw new Error('Profile not ready — try again in a moment');
    addLog(`automation-gate: connect start uid=${user.$id.slice(0, 12)}…`);
    try {
      await startInstagramOAuth(user.$id, user.$id);
    } catch (err: unknown) {
      addLog(
        `automation-gate: oauth failed err=${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
    await queryClient.invalidateQueries({ queryKey: ['automationGate'] });
    await queryClient.invalidateQueries({ queryKey: ['creator'] });

    const creator = await getCreatorByClerkId(user.$id);
    const tokenLen = creator?.access_token?.length ?? 0;
    addLog(
      `automation-gate: post-oauth creator username=${creator?.username ?? '(none)'} token_len=${tokenLen} onboarded=${creator?.is_onboarded ?? false}`
    );
    if (!hasUsableInstagramToken(creator?.access_token)) {
      throw new Error(
        'Instagram connected but no usable token was saved. Ensure EXPO_PUBLIC_IG_APP_ID matches the backend INSTAGRAM_APP_ID (Instagram App ID from Meta → Instagram → API setup, not the Facebook App ID).'
      );
    }
    addLog('automation-gate: connect ok');
  }, [user, isReady, queryClient]);

  return {
    connected: query.data?.connected ?? false,
    loading: !isReady || query.isLoading,
    connect,
  };
}
