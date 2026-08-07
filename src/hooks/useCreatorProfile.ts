import { useRef, useEffect, useMemo } from 'react';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { getCreatorByClerkId, listThreads, listPosts } from '@/lib/repository';
import { fetchMedia, fetchInsights } from '@/lib/instagram';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useBridge } from '@/lib/bridge-context';
import type { Creator, DealThread } from '@/lib/types';
import type { InstagramMediaResponse, InstagramInsightsResponse } from '@/lib/instagram';

export interface PostRow {
  $id?: string;
  creator_username: string;
  shortcode: string;
  post_url: string;
  video_view_count: number;
  is_video: boolean;
  display_url?: string;
}

interface UseCreatorProfileResult {
  creator: Creator | null;
  dealThreads: DealThread[];
  recentReels: PostRow[];
  recentMedia: InstagramMediaResponse[];
  insights: InstagramInsightsResponse | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useCreatorProfile(): UseCreatorProfileResult {
  const { data: user } = useAppwriteUser();
  const appwriteUserId = user?.$id ?? '';
  const queryClient = useQueryClient();
  const cancelledRef = useRef(false);
  const { isReady } = useBridge();

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const canFetch = !!appwriteUserId && isReady;

  const results = useQueries({
    queries: [
      {
        queryKey: ['creator', appwriteUserId],
        queryFn: async (): Promise<Creator | null> => {
          if (!appwriteUserId) return null;
          return getCreatorByClerkId(appwriteUserId);
        },
        enabled: canFetch,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorThreads', appwriteUserId],
        queryFn: async (): Promise<DealThread[]> => {
          if (!appwriteUserId) return [];
          const creator = await getCreatorByClerkId(appwriteUserId);
          if (!creator || !creator.ig_user_id) return [];
          return listThreads(creator.ig_user_id, { orderDesc: false });
        },
        enabled: canFetch,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorPosts', appwriteUserId],
        queryFn: async (): Promise<PostRow[]> => {
          if (!appwriteUserId) return [];
          const creator = await getCreatorByClerkId(appwriteUserId);
          if (!creator || !creator.username) return [];
          return listPosts(creator.username, 3);
        },
        enabled: canFetch,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorMedia', appwriteUserId],
        queryFn: async (): Promise<InstagramMediaResponse[]> => {
          if (!appwriteUserId) return [];
          try {
            return await fetchMedia();
          } catch (err) {
            if (err instanceof Error && err.message === 'session_expired') {
              throw err; // surface to error state
            }
            // Non-critical — media fetch failure doesn't block profile
            return [];
          }
        },
        enabled: canFetch,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
      },
      {
        queryKey: ['creatorInsights', appwriteUserId],
        queryFn: async (): Promise<InstagramInsightsResponse | null> => {
          if (!appwriteUserId) return null;
          try {
            const data = await fetchInsights();
            if (data.error) return null; // business account required
            return data;
          } catch (err) {
            if (err instanceof Error && err.message === 'session_expired') {
              throw err; // surface to error state
            }
            return null;
          }
        },
        enabled: canFetch,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
      },
    ],
  });

  const [
    creatorQuery,
    threadsQuery,
    postsQuery,
    mediaQuery,
    insightsQuery,
  ] = results;

  const creator = creatorQuery.data ?? null;
  const dealThreads = threadsQuery.data ?? [];
  const recentReels = postsQuery.data ?? [];
  const recentMedia = mediaQuery.data ?? [];
  const insights = insightsQuery.data ?? null;

  const isLoading =
    !isReady ||
    (creatorQuery.isLoading &&
      threadsQuery.isLoading &&
      postsQuery.isLoading);

  const sessionExpiredError =
    mediaQuery.error instanceof Error && mediaQuery.error.message === 'session_expired'
      ? 'session_expired'
      : insightsQuery.error instanceof Error && insightsQuery.error.message === 'session_expired'
        ? 'session_expired'
        : null;

  const error = useMemo(() => {
    if (sessionExpiredError) return sessionExpiredError;
    if (creatorQuery.isError && creatorQuery.error) {
      const err = creatorQuery.error;
      return err instanceof Error ? err.message : 'Failed to load profile';
    }
    return null;
  }, [sessionExpiredError, creatorQuery.isError, creatorQuery.error]);

  const refresh = async () => {
    if (cancelledRef.current) return;
    queryClient.invalidateQueries({ queryKey: ['creator', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorThreads', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorPosts', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorMedia', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorInsights', appwriteUserId] });
  };

  return {
    creator,
    dealThreads,
    recentReels,
    recentMedia,
    insights,
    isLoading,
    error,
    refresh,
  };
}
