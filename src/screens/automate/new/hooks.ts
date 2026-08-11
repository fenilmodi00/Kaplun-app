import { useCallback, useState } from 'react';
import { fetchMedia, type InstagramMediaResponse } from '@/lib/instagram';
import { addLog } from '@/lib/logger';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from '@/lib/reanimated-platform';

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

export function usePressFeedback(scaleDown = 0.97) {
  const scale = useSharedValue(1);
  const onPressIn = useCallback(() => {
    scale.value = withTiming(scaleDown, { duration: 100 });
  }, [scale, scaleDown]);
  const onPressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 150 });
  }, [scale]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: scale.value < 1 ? 0.9 : 1,
  }));
  return { onPressIn, onPressOut, animatedStyle };
}
