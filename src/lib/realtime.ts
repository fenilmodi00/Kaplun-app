import { useEffect, useRef } from 'react';
import { realtime } from '@/lib/appwrite';
import type { RealtimeResponseEvent, RealtimeSubscription } from 'appwrite';

type RealtimeCallback = (event: RealtimeResponseEvent<unknown>) => void;

export function useRealtimeSubscription(
  channels: string | string[],
  callback: RealtimeCallback,
): void {
  const callbackRef = useRef<RealtimeCallback>(callback);
  callbackRef.current = callback;

  useEffect(() => {
    const channelList = Array.isArray(channels) ? channels : [channels];
    if (channelList.length === 0) return;

    let subscription: RealtimeSubscription | null = null;
    let cancelled = false;

    const subscribe = async () => {
      try {
        subscription = await realtime.subscribe(
          channelList,
          (event: RealtimeResponseEvent<unknown>) => {
            if (!cancelled) {
              callbackRef.current(event);
            }
          },
        );
      } catch {
        // Subscription failed (e.g. not authenticated) — silently ignore
      }
    };

    subscribe();

    return () => {
      cancelled = true;
      if (subscription) {
        subscription.unsubscribe().catch(() => {
          // Cleanup error — ignore
        });
      }
    };
  }, [channels]);
}
