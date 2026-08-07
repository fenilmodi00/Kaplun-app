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

import { extractSessionSecret } from '@/lib/auth-session';

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
