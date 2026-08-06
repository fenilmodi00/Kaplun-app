import { account } from './appwrite';
import { executeWithRetry } from './resilient';
import { addLog } from './logger';
import type { Models } from 'appwrite';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
const BRIDGE_TIMEOUT_MS = 10_000;
const BRIDGE_TTL_MS = 24 * 60 * 60 * 1_000; // 24h — fast path for re-opens
const BRIDGE_PATH = '/auth/appwrite-session';

// Tracks when we last successfully bridged. Used to skip the full bridge
// on quick app re-opens — just verify the session with account.get() (~500ms).
let lastBridgeAt = 0;
/** Dedupes concurrent ensureAppwriteSession callers (AuthGate + screens). */
let bridgeInFlight: Promise<Models.User<Models.Preferences>> | null = null;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.'
  );
}

function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return true;
  if (!(err instanceof Error)) return false;
  return /aborted|canceled|cancelled/i.test(err.message);
}

/**
 * Fetch Appwrite session credentials from the backend.
 *
 * Returns {userId, secret} that the caller can use to create an
 * Appwrite session after ensuring the old session is cleared.
 */
export async function createAppwriteSession(clerkToken: string) {
  const bridgeUrl = `${API_BASE_URL}${BRIDGE_PATH}`;

  // Per-attempt AbortController — never share one across executeWithRetry
  // retries (a timed-out signal stays aborted forever).
  const fetchSession = async () => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(bridgeUrl, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clerkToken}`,
        },
        signal: controller.signal,
      });
    } catch (err: unknown) {
      if (isAbortError(err)) {
        throw new Error(
          `Bridge timed out after ${BRIDGE_TIMEOUT_MS}ms — check EXPO_PUBLIC_IG_API_BASE_URL (${API_BASE_URL}) matches api-go IG_API_PORT / PUBLIC_BASE_URL`
        );
      }
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`Bridge fetch failed to ${bridgeUrl}: ${detail}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Bridge failed' }));
      throw new Error(error.message || 'Failed to create Appwrite session');
    }

    return response.json() as Promise<{ userId: string; secret: string }>;
  };

  return executeWithRetry(fetchSession);
}

/**
 * Bridge Clerk authentication to an Appwrite session.
 *
 * On every Clerk sign-in this:
 * 1. Gets a fresh Clerk JWT
 * 2. Starts deleteSession + backend call in parallel (save ~500ms)
 * 3. Creates the new Appwrite session with fresh credentials
 *
 * The backend idempotently ensures a creator profile row exists, so
 * switching Clerk accounts or signing in after a long gap always
 * produces a consistent database state.
 *
 * @throws Error with message `bridge_failed` if the exchange fails
 */
export async function ensureAppwriteSession(
  getToken: () => Promise<string | null>
): Promise<Models.User<Models.Preferences>> {
  if (bridgeInFlight) return bridgeInFlight;

  bridgeInFlight = (async () => {
    // ── Fast path ───────────────────────────────────────────────────────────
    // If we recently bridged, skip the full exchange and just verify the
    // session is still valid with a single account.get() (~500ms vs ~4s).
    if (Date.now() - lastBridgeAt < BRIDGE_TTL_MS) {
      try {
        const user = await account.get();
        addLog('bridge: fast-path hit');
        return user;
      } catch {
        addLog('bridge: fast-path miss — full bridge');
        // Session expired — fall through to full bridge.
      }
    }

    // ── Full bridge ─────────────────────────────────────────────────────────
    addLog(`bridge: full exchange start → ${API_BASE_URL}`);

    try {
      const token = await getToken();
      if (!token) {
        throw new Error('Not authenticated — please sign in again');
      }

      // Run deleteSession in parallel with the backend call.
      const [deletePromise, backendPromise] = [
        account.deleteSession({ sessionId: 'current' }).catch(() => {}),
        createAppwriteSession(token),
      ];

      await deletePromise;
      const { userId, secret } = await backendPromise;
      await account.createSession({ userId, secret });

      lastBridgeAt = Date.now();
      addLog('bridge: success');
      return await account.get();
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : String(err);
      addLog(`bridge: failed — ${detail}`);
      throw new Error('bridge_failed');
    }
  })();

  try {
    return await bridgeInFlight;
  } finally {
    bridgeInFlight = null;
  }
}
