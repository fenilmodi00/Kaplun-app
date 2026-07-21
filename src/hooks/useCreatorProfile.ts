import { useState, useEffect, useCallback, useRef } from 'react';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { tablesDB } from '@/lib/appwrite';
import { DATABASE_ID, TABLES } from '@/lib/constants';
import { Query } from 'appwrite';
import type { Creator, DealThread } from '@/lib/types';
import { fetchMedia, fetchInsights } from '@/lib/instagram';
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
  const [creator, setCreator] = useState<Creator | null>(null);
  const [dealThreads, setDealThreads] = useState<DealThread[]>([]);
  const [recentReels, setRecentReels] = useState<PostRow[]>([]);
  const [recentMedia, setRecentMedia] = useState<InstagramMediaResponse[]>([]);
  const [insights, setInsights] = useState<InstagramInsightsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const fetchProfile = useCallback(async () => {
    if (!clerkUserId) return;
    cancelledRef.current = false;

    try {
      setIsLoading(true);
      setError(null);
      setRecentMedia([]);
      setInsights(null);

      const creatorsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.CREATORS,
        queries: [
          Query.equal('clerk_user_id', clerkUserId),
          Query.limit(1),
        ],
      });

      if (cancelledRef.current) return;

      const creatorRows = creatorsResult.rows as unknown as Creator[];
      if (creatorRows.length === 0) {
        setCreator(null);
        setIsLoading(false);
        return;
      }

      const creatorRow = creatorRows[0];
      setCreator(creatorRow);

      // 2. Fetch deal threads by ig_user_id
      const threadsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.DEAL_THREADS,
        queries: [Query.equal('ig_user_id', creatorRow.ig_user_id)],
      });

      if (cancelledRef.current) return;
      setDealThreads(threadsResult.rows as unknown as DealThread[]);

      // 3. Fetch recent reels from posts table
      const postsResult = await tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.POSTS,
        queries: [
          Query.equal('creator_username', creatorRow.username),
          Query.equal('is_video', true),
          Query.orderDesc('$createdAt'),
          Query.limit(3),
        ],
      });

      if (cancelledRef.current) return;
      setRecentReels(postsResult.rows as unknown as PostRow[]);

      // 4. Fetch media and insights from FastAPI
      try {
        const media = await fetchMedia(await getToken() ?? '');
        if (!cancelledRef.current) {
          setRecentMedia(media);
        }
      } catch (mediaErr) {
        console.warn(mediaErr);
        if (mediaErr instanceof Error && mediaErr.message === 'session_expired') {
          setError('session_expired');
          return;
        }
        // Non-critical — media fetch failure doesn't block profile
      }

      try {
        const insightsData = await fetchInsights(await getToken() ?? '');
        if (!cancelledRef.current) {
          if (insightsData.error) {
            // Business account required — not an error, just unavailable
            setInsights(null);
          } else {
            setInsights(insightsData);
          }
        }
      } catch (insightsErr) {
        console.warn(insightsErr);
        if (insightsErr instanceof Error && insightsErr.message === 'session_expired') {
          setError('session_expired');
          return;
        }
        // Non-critical — insights fetch failure doesn't block profile
      }
    } catch (err) {
      if (cancelledRef.current) return;
      setError(err instanceof Error ? err.message : 'Failed to load profile');
    } finally {
      if (!cancelledRef.current) {
        setIsLoading(false);
      }
    }
  }, [clerkUserId]);

  useEffect(() => {
    fetchProfile();

    return () => {
      cancelledRef.current = true;
    };
  }, [fetchProfile]);

  return { creator, dealThreads, recentReels, recentMedia, insights, isLoading, error, refresh: fetchProfile };
}
