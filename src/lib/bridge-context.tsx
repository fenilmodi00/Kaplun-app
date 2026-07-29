import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type BridgeStatus = 'idle' | 'bridging' | 'ready' | 'failed';

export interface BridgeContextValue {
  status: BridgeStatus;
  isReady: boolean;
  retry: () => void;
  setStatus: (status: BridgeStatus) => void;
  /** Bumped on each retry so AuthGate effects re-run. */
  attemptKey: number;
}

const BridgeContext = createContext<BridgeContextValue | null>(null);

export function BridgeProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<BridgeStatus>('idle');
  const [attemptKey, setAttemptKey] = useState(0);

  const retry = useCallback(() => {
    setStatus('bridging');
    setAttemptKey((k) => k + 1);
  }, []);

  const value = useMemo<BridgeContextValue>(
    () => ({
      status,
      isReady: status === 'ready',
      retry,
      setStatus,
      attemptKey,
    }),
    [status, retry, attemptKey],
  );

  return <BridgeContext.Provider value={value}>{children}</BridgeContext.Provider>;
}

/**
 * Appwrite bridge readiness. Safe default outside provider: not ready
 * (queries stay disabled until AuthGate mounts the provider).
 */
export function useBridge(): BridgeContextValue {
  const ctx = useContext(BridgeContext);
  if (!ctx) {
    return {
      status: 'idle',
      isReady: false,
      retry: () => {},
      setStatus: () => {},
      attemptKey: 0,
    };
  }
  return ctx;
}
