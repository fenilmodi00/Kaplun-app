import { useCallback, useState } from 'react';
import { fetchMedia, type InstagramMediaResponse } from '@/lib/instagram';
import { addLog } from '@/lib/logger';

export function useMediaPicker() {
  const [media, setMedia] = useState<InstagramMediaResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadMedia = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMedia();
      setMedia(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load media';
      setError(message);
      addLog(`Media picker error: ${message}`);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, [loading]);

  return { media, loading, error, hasLoaded, loadMedia };
}
