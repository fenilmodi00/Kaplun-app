import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { account, client } from '@/lib/appwrite';
import {
  clearStoredSession,
  getAppwriteJWT,
  isNetworkError,
  persistSession,
  restoreSession,
} from '@/lib/auth-session';
import { addLog } from '@/lib/logger';

type SessionContextValue = {
  session: string | null;
  isLoading: boolean;
  signIn: (secret: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

function fireEnsureProfile() {
  const baseUrl = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
  if (!baseUrl) return;
  getAppwriteJWT()
    .then((jwt) => {
      fetch(`${baseUrl}/auth/ensure-profile`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt}` },
      }).catch(() => {});
    })
    .catch((err: unknown) => {
      addLog(
        `[session] ensure-profile failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (!value) {
    throw new Error('useSession must be wrapped in a <SessionProvider />');
  }
  return value;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const ensuredRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    restoreSession()
      .then((secret) => {
        if (cancelled) return;
        setSession(secret);
        setIsLoading(false);
        if (!secret) return;

        // Background validation — does not block first paint.
        account
          .get()
          .then(() => {
            if (cancelled) return;
            if (!ensuredRef.current) {
              ensuredRef.current = true;
              fireEnsureProfile();
            }
          })
          .catch((err: unknown) => {
            if (cancelled) return;
            if (isNetworkError(err)) {
              addLog(
                `[session] background validate failed (network): ${err instanceof Error ? err.message : String(err)}`,
              );
              // keep session — offline
            } else {
              addLog(
                `[session] background validate failed (auth): ${err instanceof Error ? err.message : String(err)}`,
              );
              clearStoredSession();
              setSession(null);
              queryClient.clear();
            }
          });
      })
      .catch(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (secret: string) => {
    if (!secret) {
      throw new Error('session_secret_missing');
    }
    client.setSession(secret);
    await persistSession({ secret });
    setSession(secret);
    if (!ensuredRef.current) {
      ensuredRef.current = true;
      fireEnsureProfile();
    }
    await queryClient.invalidateQueries({ queryKey: ['appwrite-user'] });
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await clearStoredSession();
    ensuredRef.current = false;
    setSession(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({ session, isLoading, signIn, signOut }),
    [session, isLoading, signIn, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
