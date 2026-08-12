/**
 * extractSessionSecret — uses the real module (unmock).
 * Client createSession returns empty secret; cookieFallback holds the value.
 */

jest.unmock('@/lib/auth-session');

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

jest.mock('@/lib/appwrite', () => ({
  account: { get: jest.fn(), createJWT: jest.fn(), deleteSession: jest.fn() },
  client: { setSession: jest.fn() },
}));

import { extractSessionSecret, restoreSession, isNetworkError } from '@/lib/auth-session';
import * as SecureStore from 'expo-secure-store';
import { account, client } from '@/lib/appwrite';

describe('extractSessionSecret', () => {
  const PROJECT_ID = 'proj-test';

  beforeEach(() => {
    process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID = PROJECT_ID;
    const store = new Map<string, string>();
    (globalThis as { localStorage: Storage }).localStorage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => {
        store.set(k, String(v));
      },
      removeItem: (k) => {
        store.delete(k);
      },
      clear: () => store.clear(),
      key: () => null,
      length: 0,
    };
  });

  it('prefers session.secret when present', () => {
    expect(extractSessionSecret({ secret: 'from-response' })).toBe('from-response');
  });

  it('reads a_session_<projectId> from cookieFallback when secret is empty', () => {
    globalThis.localStorage.setItem(
      'cookieFallback',
      JSON.stringify({ [`a_session_${PROJECT_ID}`]: 'from-cookie' }),
    );
    expect(extractSessionSecret({ secret: '' })).toBe('from-cookie');
  });

  it('throws when neither secret nor cookieFallback is available', () => {
    expect(() => extractSessionSecret({ secret: '' })).toThrow('session_secret_missing');
  });
});

describe('isNetworkError', () => {
  it('returns true for TypeError', () => {
    expect(isNetworkError(new TypeError('fetch failed'))).toBe(true);
  });

  it('returns true for AbortError', () => {
    const err = new DOMException('aborted', 'AbortError');
    expect(isNetworkError(err)).toBe(true);
  });

  it('returns true for Appwrite code >= 500', () => {
    expect(isNetworkError({ code: 500 })).toBe(true);
    expect(isNetworkError({ code: 502 })).toBe(true);
    expect(isNetworkError({ code: 503 })).toBe(true);
  });

  it('returns false for Appwrite code 401', () => {
    expect(isNetworkError({ code: 401 })).toBe(false);
  });

  it('returns false for a generic Error', () => {
    expect(isNetworkError(new Error('something'))).toBe(false);
  });
});

describe('restoreSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reads secret, calls setSession, and returns the secret — without calling account.get', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('secret-123');

    const result = await restoreSession();

    expect(result).toBe('secret-123');
    expect(client.setSession).toHaveBeenCalledWith('secret-123');
    expect(account.get).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('returns null and skips setSession when no secret is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);

    const result = await restoreSession();

    expect(result).toBeNull();
    expect(client.setSession).not.toHaveBeenCalled();
    expect(account.get).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
