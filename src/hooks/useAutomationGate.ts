// src/hooks/useAutomationGate.ts
import { useAuth, useUser } from '@clerk/expo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { getCreatorByClerkId } from '@/lib/repository';

/** Gate: automations need an OAuth-connected IG professional account
 *  (creators.access_token present). connect() runs the existing OAuth flow. */
export function useAutomationGate() {
  const { user } = useUser();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automationGate', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const creator = await getCreatorByClerkId(user!.id);
      return { connected: !!creator?.access_token, appwriteUserId: creator?.$id ?? null };
    },
  });

  const connect = useCallback(async () => {
    if (!user) throw new Error('Not signed in');
    const appwriteUserId = query.data?.appwriteUserId;
    if (!appwriteUserId) throw new Error('Profile not ready — try again in a moment');
    await startInstagramOAuth(user.id, appwriteUserId);
    await queryClient.invalidateQueries({ queryKey: ['automationGate'] });
    await queryClient.invalidateQueries({ queryKey: ['creator'] });
  }, [user, query.data?.appwriteUserId, queryClient]);

  return {
    connected: query.data?.connected ?? false,
    loading: query.isLoading,
    connect,
  };
}
