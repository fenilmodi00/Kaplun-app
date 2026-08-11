/**
 * useAuthFlow hook tests — Appwrite auth + SessionProvider.
 */

jest.mock('@/lib/appwrite', () => ({
  account: {
    create: jest.fn(),
    createEmailToken: jest.fn(),
    createSession: jest.fn(),
    createOAuth2Token: jest.fn(),
    get: jest.fn(),
    deleteSession: jest.fn(),
  },
  client: {
    setSession: jest.fn(),
  },
  tablesDB: {},
  storage: {},
  realtime: {},
}));

const mockSignIn = jest.fn().mockResolvedValue(undefined);

jest.mock('@/lib/session-context', () => ({
  useSession: () => ({
    session: null,
    isLoading: false,
    signIn: mockSignIn,
    signOut: jest.fn(),
  }),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('kaplun://localhost'),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

import React from 'react';
import { renderHook, act } from '@testing-library/react-native';
import { useAuthFlow } from '@/hooks/useAuthFlow';
import { account } from '@/lib/appwrite';
import { openAuthSessionAsync } from 'expo-web-browser';

const mockAccountCreate = account.create as jest.Mock;
const mockCreateEmailToken = account.createEmailToken as jest.Mock;
const mockCreateSession = account.createSession as jest.Mock;
const mockCreateOAuth2Token = account.createOAuth2Token as jest.Mock;
const mockOpenAuthSessionAsync = openAuthSessionAsync as jest.Mock;

const PROJECT_ID = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID || 'test-project-id';

describe('useAuthFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSignIn.mockResolvedValue(undefined);
    // Client createSession returns empty secret; real secret is in cookieFallback.
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

  it('signup OTP path: creates user, verifies OTP, signs in with cookieFallback secret', async () => {
    mockAccountCreate.mockResolvedValue({ $id: 'new-user-id' });
    mockCreateEmailToken.mockResolvedValue({ userId: 'new-user-id', secret: 'email-secret' });
    mockCreateSession.mockImplementation(async () => {
      globalThis.localStorage.setItem(
        'cookieFallback',
        JSON.stringify({ [`a_session_${PROJECT_ID}`]: 'cookie-session-secret' }),
      );
      return { secret: '' };
    });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.submitEmailPassword('test@example.com', 'password123');
    });

    expect(result.current.step).toBe('otp-sent');

    await act(async () => {
      await result.current.submitOTP('123456');
    });

    expect(mockCreateSession).toHaveBeenCalledWith({ userId: 'new-user-id', secret: '123456' });
    expect(mockSignIn).toHaveBeenCalledWith('cookie-session-secret');
    expect(result.current.step).toBe('complete');
  });

  it('login OTP path: signs in with cookieFallback when response secret is empty', async () => {
    mockCreateEmailToken.mockResolvedValue({ userId: 'existing-user-id', secret: 'email-secret' });
    mockCreateSession.mockImplementation(async () => {
      globalThis.localStorage.setItem(
        'cookieFallback',
        JSON.stringify({ [`a_session_${PROJECT_ID}`]: 'login-session-secret' }),
      );
      return { secret: '' };
    });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.submitEmailOTP('existing@example.com');
    });

    await act(async () => {
      await result.current.submitOTP('654321');
    });

    expect(mockSignIn).toHaveBeenCalledWith('login-session-secret');
    expect(result.current.step).toBe('complete');
  });

  it('Google cancel path: sets error when browser is cancelled', async () => {
    mockCreateOAuth2Token.mockResolvedValue('https://oauth.google.com/auth');
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(result.current.error).toBe('Google sign-in was cancelled');
    expect(result.current.step).toBe('idle');
  });

  it('Google success path: signs in with cookieFallback secret', async () => {
    mockCreateOAuth2Token.mockResolvedValue('https://oauth.google.com/auth');
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'kaplun://localhost?userId=google-user-id&secret=google-secret',
    });
    mockCreateSession.mockImplementation(async () => {
      globalThis.localStorage.setItem(
        'cookieFallback',
        JSON.stringify({ [`a_session_${PROJECT_ID}`]: 'google-session-secret' }),
      );
      return { secret: '' };
    });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(mockSignIn).toHaveBeenCalledWith('google-session-secret');
    expect(result.current.step).toBe('complete');
  });
});
