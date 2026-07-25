import { useEffect, useRef, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { realtime } from '@/lib/appwrite';
import { addLog } from '@/lib/logger';
import type { RealtimeResponseEvent, RealtimeSubscription } from 'appwrite';

type RealtimeCallback = (event: RealtimeResponseEvent<unknown>) => void;

const MAX_RECONNECT_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;
const DEBOUNCE_MS = 2_000;

/**
 * Subscribe to Appwrite Realtime channels with automatic reconnect
 * on failure, AppState foreground refetch, and 2s debounce coalescing.
 *
 * @param channels  One or more Realtime channel strings.
 * @param callback  Invoked on each realtime event (debounced) and on reconnect.
 */
export function useRealtimeSubscription(
  channels: string | string[],
  callback: RealtimeCallback,
): void {
  const callbackRef = useRef<RealtimeCallback>(callback);
  callbackRef.current = callback;

  // ── Debounce: coalesce rapid-fire events ────────────────────────────
  const lastInvocationRef = useRef(0);
  const pendingRef = useRef<RealtimeResponseEvent<unknown> | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedCallback = useCallback((event: RealtimeResponseEvent<unknown>) => {
    const now = Date.now();
    const elapsed = now - lastInvocationRef.current;

    if (elapsed >= DEBOUNCE_MS) {
      lastInvocationRef.current = now;
      callbackRef.current(event);
      return;
    }

    // Store the latest event and schedule flush
    pendingRef.current = event;
    if (debounceTimerRef.current !== null) return; // already scheduled

    const remaining = DEBOUNCE_MS - elapsed;
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      lastInvocationRef.current = Date.now();
      if (pendingRef.current) {
        callbackRef.current(pendingRef.current);
        pendingRef.current = null;
      }
    }, remaining);
  }, []);

  useEffect(() => {
    const channelList = Array.isArray(channels) ? channels : [channels];
    if (channelList.length === 0) return;

    let subscription: RealtimeSubscription | null = null;
    let cancelled = false;
    let reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const subscribe = async () => {
      try {
        subscription = await realtime.subscribe(
          channelList,
          (event: RealtimeResponseEvent<unknown>) => {
            if (!cancelled) {
              debouncedCallback(event);
            }
          },
        );
        // Success — reset backoff and invoke callback for missed events
        reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
        if (!cancelled) {
          callbackRef.current({ events: ['*'], channels: channelList, timestamp: '' } as RealtimeResponseEvent<unknown>);
        }
      } catch (err) {
        if (cancelled) return;
        addLog(
          `[realtime] Subscribe failed, reconnecting in ${
            reconnectDelay / 1000
          }s`,
        );
        reconnectTimer = setTimeout(() => {
          reconnectTimer = null;
          reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY_MS);
          subscribe();
        }, reconnectDelay);
      }
    };

    subscribe();

    // ── AppState: refetch on foreground ────────────────────────────────
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active' && !cancelled) {
        addLog('[realtime] App foregrounded — triggering refetch');
        callbackRef.current({ events: ['*'], channels: channelList, timestamp: '' } as RealtimeResponseEvent<unknown>);
      }
    };

    const appStateSubscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      cancelled = true;
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      if (debounceTimerRef.current !== null) clearTimeout(debounceTimerRef.current);
      appStateSubscription.remove();
      if (subscription) {
        subscription.unsubscribe().catch(() => {
          // Cleanup error — ignore
        });
      }
    };
  }, [channels, debouncedCallback]);
}
