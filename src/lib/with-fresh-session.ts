/**
 * Session-expiry auto-recovery wrapper.
 *
 * When an Instagram API call throws `session_expired`, this wrapper
 * re-bridges the Appwrite session (via Clerk JWT → FastAPI bridge)
 * and replays the original call exactly once. Non-session errors
 * pass through immediately without attempting recovery.
 */

import { ensureAppwriteSession } from './auth-bridge';

/**
 * Execute `fn`, and if it throws `session_expired`, re-bridge the
 * Appwrite session then retry `fn` once.
 *
 * @param fn  The async function to execute (e.g. `fetchMedia`).
 * @param getToken  Function that returns a fresh Clerk JWT (e.g. `useAuth().getToken`).
 * @returns The resolved value from `fn`.
 * @throws The error from the first call (if it's not `session_expired`) or
 *         the error from the retry (if `session_expired` persists).
 *
 * @example
 * const media = await withFreshSession(
 *   () => fetchMedia(),
 *   getToken,
 * );
 */
export async function withFreshSession<T>(
  fn: () => Promise<T>,
  getToken: () => Promise<string | null>,
): Promise<T> {
  // First attempt
  try {
    return await fn();
  } catch (err) {
    // Only recoverable error is explicit session expiry
    if (!(err instanceof Error) || err.message !== 'session_expired') {
      throw err;
    }

    // Re-bridge the session
    await ensureAppwriteSession(getToken);

    // Retry once
    return fn();
  }
}
