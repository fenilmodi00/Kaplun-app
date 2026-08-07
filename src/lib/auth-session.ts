import * as SecureStore from 'expo-secure-store';
import { client, account } from '@/lib/appwrite';
import { addLog } from '@/lib/logger';

const SESSION_KEY = 'appwrite_session_secret';
const JWT_CACHE_TTL_MS = 14 * 60 * 1000; // 14 minutes

let jwtCache: { jwt: string; at: number } | null = null;

/**
 * Restore an Appwrite session from secure storage.
 *
 * Reads the stored session secret, calls `client.setSession(secret)`,
 * then validates with `account.get()`. On any failure, clears the stored
 * key and returns `null`.
 */
export async function restoreSession(): Promise<{ $id: string } | null> {
  try {
    const secret = await SecureStore.getItemAsync(SESSION_KEY);
    if (!secret) return null;
    client.setSession(secret);
    const user = await account.get();
    return user;
  } catch (err: unknown) {
    addLog(
      `[auth-session] restore failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
    return null;
  }
}

/**
 * Persist an Appwrite session secret to secure storage.
 */
export async function persistSession(session: { secret: string }): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, session.secret);
}

/**
 * Clear the stored session and delete the current Appwrite session.
 *
 * Deleting the server session is best-effort; local storage is always wiped.
 */
export async function clearStoredSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
  try {
    await account.deleteSession({ sessionId: 'current' });
  } catch (_err: unknown) {
    // best-effort
  }
}

/**
 * Get a fresh Appwrite JWT, caching for 14 minutes.
 *
 * Reuses the cached JWT if it is less than 14 minutes old.
 * Otherwise calls `account.createJWT()` and caches the result.
 *
 * @throws Error('session_expired') if JWT creation fails.
 */
export async function getAppwriteJWT(): Promise<string> {
  if (jwtCache && Date.now() - jwtCache.at < JWT_CACHE_TTL_MS) {
    return jwtCache.jwt;
  }
  try {
    const { jwt } = await account.createJWT();
    jwtCache = { jwt, at: Date.now() };
    return jwt;
  } catch (err: unknown) {
    addLog(
      `[auth-session] JWT creation failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    throw new Error('session_expired');
  }
}
