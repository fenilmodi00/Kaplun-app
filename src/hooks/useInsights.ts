import { useMemo } from 'react';
import { keepPreviousData, useQueries, useQueryClient } from '@tanstack/react-query';

import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useBridge } from '@/lib/bridge-context';
import {
  fetchAccountInsights,
  fetchMedia,
  fetchProfile,
  type InstagramAccountInsights,
  type InstagramMediaResponse,
  type InstagramProfileResponse,
} from '@/lib/instagram';

export interface TopMediaItem extends InstagramMediaResponse {
  engagement: number;
  imageUri: string | null;
}

// Meta reports insights with up to 48h delay — 30s staleness only buys
// repeated Graph calls. 6h keeps the tab cheap without going stale in-session.
const INSIGHTS_STALE_TIME = 6 * 60 * 60_000;

interface UseInsightsResult {
  profile: InstagramProfileResponse | null;
  insights: InstagramAccountInsights | null;
  topMedia: TopMediaItem[];
  isLoading: boolean;
  /** True while any fetch is in flight with data already on screen. */
  isRefreshing: boolean;
  /**
   * 'session_expired'  — Instagram token unusable, full reconnect required.
   * 'insights_permission' — token predates the insights scope, reconnect to grant.
   * any other string   — generic insights fetch failure (show inline retry).
   */
  error: string | null;
  refresh: () => void;
}

function isSessionExpired(err: unknown): boolean {
  return err instanceof Error && err.message === 'session_expired';
}

export function useInsights(windowDays: number): UseInsightsResult {
  const { data: user } = useAppwriteUser();
  const appwriteUserId = user?.$id ?? '';
  const { isReady } = useBridge();
  const queryClient = useQueryClient();
  const canFetch = !!appwriteUserId && isReady;

  const [profileQuery, insightsQuery, mediaQuery] = useQueries({
    queries: [
      {
        queryKey: ['insightsProfile', appwriteUserId],
        queryFn: async (): Promise<InstagramProfileResponse | null> => {
          try {
            return await fetchProfile();
          } catch (err) {
            if (isSessionExpired(err)) throw err;
            return null;
          }
        },
        enabled: canFetch,
        staleTime: INSIGHTS_STALE_TIME,
        retry: false,
      },
      {
        queryKey: ['insightsAccount', appwriteUserId, windowDays],
        // Insights are the screen's core content: let every error surface so
        // the UI can distinguish permission/reconnect states from "no data".
        queryFn: (): Promise<InstagramAccountInsights> =>
          fetchAccountInsights(windowDays),
        // Period toggle: keep the previous window's data on screen while the
        // new one fetches — no skeleton on switch.
        placeholderData: keepPreviousData,
        enabled: canFetch,
        staleTime: INSIGHTS_STALE_TIME,
        retry: false,
      },
      {
        queryKey: ['insightsMedia', appwriteUserId],
        queryFn: async (): Promise<InstagramMediaResponse[]> => {
          try {
            return await fetchMedia();
          } catch (err) {
            if (isSessionExpired(err)) throw err;
            return [];
          }
        },
        enabled: canFetch,
        staleTime: INSIGHTS_STALE_TIME,
        retry: false,
      },
    ],
  });

  const topMedia = useMemo(
    () =>
      (mediaQuery.data ?? [])
        .map((m) => ({
          ...m,
          engagement: (m.like_count ?? 0) + (m.comments_count ?? 0),
          imageUri: m.thumbnail_url ?? m.media_url,
        }))
        .sort((a, b) => b.engagement - a.engagement)
        .slice(0, 6),
    [mediaQuery.data]
  );

  const sessionExpired =
    isSessionExpired(profileQuery.error) ||
    isSessionExpired(insightsQuery.error) ||
    isSessionExpired(mediaQuery.error);

  const error = sessionExpired
    ? 'session_expired'
    : insightsQuery.error instanceof Error
      ? insightsQuery.error.message
      : null;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['insightsProfile', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['insightsAccount', appwriteUserId] });
    queryClient.invalidateQueries({ queryKey: ['insightsMedia', appwriteUserId] });
  };

  return {
    profile: profileQuery.data ?? null,
    insights: insightsQuery.data ?? null,
    topMedia,
    // Loading means "nothing to show": pending with no data of our own.
    // keepPreviousData supplies data during period switches, and restored
    // caches arrive with data — neither should skeleton.
    isLoading: !isReady || (insightsQuery.isPending && insightsQuery.data === undefined),
    isRefreshing: insightsQuery.isFetching,
    error,
    refresh,
  };
}
