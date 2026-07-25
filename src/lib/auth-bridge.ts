import { account } from './appwrite';
import { executeWithRetry } from './resilient';
import type { Models } from 'appwrite';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
const BRIDGE_TIMEOUT_MS = 10_000;
const BRIDGE_TTL_MS = 24 * 60 * 60 * 1_000; // 24h — fast path for re-opens

// Tracks when we last successfully bridged. Used to skip the full bridge
// on quick app re-opens — just verify the session with account.get() (~500ms).
let lastBridgeAt = 0;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.'
  );
}
/**
 * Fetch Appwrite session credentials from the backend.
 *
 * Returns {userId, secret} that the caller can use to create an
 * Appwrite session after ensuring the old session is cleared.
 */
export async function createAppwriteSession(clerkToken: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRIDGE_TIMEOUT_MS);

  const fetchSession = async () => {
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}/auth/appwrite-session`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${clerkToken}`,
        },
        signal: controller.signal,
      });
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
 * @throws Error if no Clerk token is available or the bridge request fails
 */
export async function ensureAppwriteSession(
  getToken: () => Promise<string | null>
): Promise<Models.User<Models.Preferences>> {
  // ── Fast path ─────────────────────────────────────────────────────────────
  // If we recently bridged, skip the full exchange and just verify the
  // session is still valid with a single account.get() (~500ms vs ~4s).
  if (Date.now() - lastBridgeAt < BRIDGE_TTL_MS) {
    try {
      return await account.get();
    } catch {
      // Session expired — fall through to full bridge.
    }
  }

  // ── Full bridge ───────────────────────────────────────────────────────────

  // 1. Get a fresh Clerk JWT first.
  const token = await getToken();
  if (!token) {
    throw new Error('Not authenticated — please sign in again');
  }

  // 2. Run deleteSession in parallel with the backend call.
  //    They are independent — this shaves ~500ms off the critical path.
  const [deletePromise, backendPromise] = [
    account.deleteSession({ sessionId: 'current' }).catch(() => {}),
    createAppwriteSession(token),
  ];

  // Wait for both, then create the new session (must happen after delete).
  await deletePromise;
  const { userId, secret } = await backendPromise;
  await account.createSession({ userId, secret });

  // 3. Record bridge time so subsequent opens use the fast path.
  lastBridgeAt = Date.now();

  // 4. Return the now-active Appwrite user.
  return account.get();
}
