import { useRef, useEffect, useMemo } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { getCreatorByClerkId, listThreads, listPosts } from '@/lib/repository';
import { fetchMedia, fetchInsights } from '@/lib/instagram';
import { withFreshSession } from '@/lib/with-fresh-session';
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
  const { user } = useUser();
  const { getToken } = useAuth();
  const clerkUserId = user?.id ?? '';
  const queryClient = useQueryClient();
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  const results = useQueries({
    queries: [
      {
        queryKey: ['creator', clerkUserId],
        queryFn: async (): Promise<Creator | null> => {
          if (!clerkUserId) return null;
          return getCreatorByClerkId(clerkUserId);
        },
        enabled: !!clerkUserId,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorThreads', clerkUserId],
        queryFn: async (): Promise<DealThread[]> => {
          if (!clerkUserId) return [];
          const creator = await getCreatorByClerkId(clerkUserId);
          if (!creator || !creator.ig_user_id) return [];
          return listThreads(creator.ig_user_id, { orderDesc: false });
        },
        enabled: !!clerkUserId,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorPosts', clerkUserId],
        queryFn: async (): Promise<PostRow[]> => {
          if (!clerkUserId) return [];
          const creator = await getCreatorByClerkId(clerkUserId);
          if (!creator || !creator.username) return [];
          return listPosts(creator.username, 3);
        },
        enabled: !!clerkUserId,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
      },
      {
        queryKey: ['creatorMedia', clerkUserId],
        queryFn: async (): Promise<InstagramMediaResponse[]> => {
          if (!clerkUserId) return [];
          try {
            return await withFreshSession(() => fetchMedia(), getToken);
          } catch (err) {
            if (err instanceof Error && err.message === 'session_expired') {
              throw err; // surface to error state
            }
            // Non-critical — media fetch failure doesn't block profile
            return [];
          }
        },
        enabled: !!clerkUserId,
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: false,
      },
      {
        queryKey: ['creatorInsights', clerkUserId],
        queryFn: async (): Promise<InstagramInsightsResponse | null> => {
          if (!clerkUserId) return null;
          try {
            const data = await withFreshSession(() => fetchInsights(), getToken);
            if (data.error) return null; // business account required
            return data;
          } catch (err) {
            if (err instanceof Error && err.message === 'session_expired') {
              throw err; // surface to error state
            }
            return null;
          }
        },
        enabled: !!clerkUserId,
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
    creatorQuery.isLoading &&
    threadsQuery.isLoading &&
    postsQuery.isLoading;

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
    queryClient.invalidateQueries({ queryKey: ['creator', clerkUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorThreads', clerkUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorPosts', clerkUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorMedia', clerkUserId] });
    queryClient.invalidateQueries({ queryKey: ['creatorInsights', clerkUserId] });
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
