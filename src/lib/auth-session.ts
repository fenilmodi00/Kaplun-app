import * as SecureStore from 'expo-secure-store';
import { account, client } from '@/lib/appwrite';
import { addLog } from '@/lib/logger';

const SESSION_KEY = 'appwrite_session_secret';
const JWT_CACHE_TTL_MS = 14 * 60 * 1000; // 14 minutes

let jwtCache: { jwt: string; at: number } | null = null;

/**
 * Client-side createSession does not return `secret` (API-key only).
 * Appwrite stores it in localStorage `cookieFallback` as `a_session_<projectId>`.
 * See Models.Session.secret docs + X-Fallback-Cookies in the JS SDK.
 */
export function extractSessionSecret(session: { secret?: string }): string {
  if (session.secret) return session.secret;

  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
      ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    const raw = storage?.getItem('cookieFallback');
    if (!raw) {
      throw new Error('session_secret_missing');
    }
    const cookies = JSON.parse(raw) as Record<string, string>;
    const projectId = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID ?? '';
    const key = `a_session_${projectId}`;
    const fromCookie = cookies[key] ?? Object.values(cookies).find((v) => !!v);
    if (!fromCookie) {
      throw new Error('session_secret_missing');
    }
    addLog('[auth-session] resolved session secret from cookieFallback');
    return fromCookie;
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'session_secret_missing') throw err;
    throw new Error('session_secret_missing');
  }
}

/**
 * Restore an Appwrite session from secure storage.
 *
 * Reads the stored session secret, calls `client.setSession(secret)`,
 * then validates with `account.get()`. Returns the secret on success,
 * or `null` after clearing the stored key on failure.
 */
export async function restoreSession(): Promise<string | null> {
  try {
    const secret = await SecureStore.getItemAsync(SESSION_KEY);
    if (!secret) return null;
    client.setSession(secret);
    await account.get();
    return secret;
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
  if (!session.secret) {
    throw new Error('session_secret_missing');
  }
  await SecureStore.setItemAsync(SESSION_KEY, session.secret);
}

function clearCookieFallback(): void {
  try {
    const storage = (globalThis as { localStorage?: Storage }).localStorage
      ?? (typeof window !== 'undefined' ? window.localStorage : undefined);
    storage?.removeItem?.('cookieFallback');
  } catch (_err: unknown) {
    // best-effort
  }
}

/**
 * Clear the stored session and delete the current Appwrite session.
 *
 * Deleting the server session is best-effort; local storage is always wiped.
 */
export async function clearStoredSession(): Promise<void> {
  jwtCache = null;
  await SecureStore.deleteItemAsync(SESSION_KEY).catch(() => {});
  clearCookieFallback();
  client.setSession('');
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
