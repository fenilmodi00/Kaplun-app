/**
 * useAuthFlow hook tests — Appwrite auth edition.
 *
 * Covers signup OTP, login OTP, Google cancel, and Google success paths.
 * Mocks @/lib/appwrite and @/lib/auth-session inline since todo 4
 * (jest.setup Appwrite account mock) has not run yet.
 */

jest.mock('@/lib/appwrite', () => ({
  account: {
    create: jest.fn(),
    createEmailToken: jest.fn(),
    createSession: jest.fn(),
    createOAuth2Token: jest.fn(),
  },
  client: {
    setSession: jest.fn(),
  },
  tablesDB: {},
  storage: {},
  realtime: {},
}));

jest.mock('@/lib/auth-session', () => ({
  persistSession: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn().mockReturnValue('kaplun://callback'),
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useAuthFlow } from '@/hooks/useAuthFlow';
import { account } from '@/lib/appwrite';
import { persistSession } from '@/lib/auth-session';
import { openAuthSessionAsync } from 'expo-web-browser';

const mockAccountCreate = account.create as jest.Mock;
const mockCreateEmailToken = account.createEmailToken as jest.Mock;
const mockCreateSession = account.createSession as jest.Mock;
const mockCreateOAuth2Token = account.createOAuth2Token as jest.Mock;
const mockPersistSession = persistSession as jest.Mock;
const mockOpenAuthSessionAsync = openAuthSessionAsync as jest.Mock;

describe('useAuthFlow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('signup OTP path: creates user, sends token, verifies OTP, persists session', async () => {
    mockAccountCreate.mockResolvedValue({ $id: 'new-user-id' });
    mockCreateEmailToken.mockResolvedValue({ userId: 'new-user-id', secret: 'email-secret' });
    mockCreateSession.mockResolvedValue({ secret: 'session-secret' });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.submitEmailPassword('test@example.com', 'password123');
    });

    expect(mockAccountCreate).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', password: 'password123' }),
    );
    expect(mockCreateEmailToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com' }),
    );
    expect(result.current.step).toBe('otp-sent');
    expect(result.current.email).toBe('test@example.com');

    await act(async () => {
      await result.current.submitOTP('123456');
    });

    expect(mockCreateSession).toHaveBeenCalledWith({ userId: 'new-user-id', secret: '123456' });
    expect(mockPersistSession).toHaveBeenCalledWith({ secret: 'session-secret' });
    expect(result.current.step).toBe('complete');
  });

  it('login OTP path: sends token, verifies OTP, persists session', async () => {
    mockCreateEmailToken.mockResolvedValue({ userId: 'existing-user-id', secret: 'email-secret' });
    mockCreateSession.mockResolvedValue({ secret: 'session-secret' });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.submitEmailOTP('existing@example.com');
    });

    expect(mockCreateEmailToken).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'existing@example.com' }),
    );
    expect(result.current.step).toBe('otp-sent');
    expect(result.current.email).toBe('existing@example.com');

    await act(async () => {
      await result.current.submitOTP('654321');
    });

    expect(mockCreateSession).toHaveBeenCalledWith({ userId: 'existing-user-id', secret: '654321' });
    expect(mockPersistSession).toHaveBeenCalledWith({ secret: 'session-secret' });
    expect(result.current.step).toBe('complete');
  });

  it('Google cancel path: sets error when browser is cancelled', async () => {
    mockCreateOAuth2Token.mockReturnValue('https://oauth.google.com/auth');
    mockOpenAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(result.current.error).toBe('Google sign-in was cancelled');
    expect(result.current.step).toBe('idle');
  });

  it('Google success path: parses URL, creates session, persists, completes', async () => {
    mockCreateOAuth2Token.mockReturnValue('https://oauth.google.com/auth');
    mockOpenAuthSessionAsync.mockResolvedValue({
      type: 'success',
      url: 'kaplun://callback?userId=google-user-id&secret=google-secret',
    });
    mockCreateSession.mockResolvedValue({ secret: 'google-session-secret' });

    const { result } = await renderHook(() => useAuthFlow());

    await act(async () => {
      await result.current.loginWithGoogle();
    });

    expect(mockCreateSession).toHaveBeenCalledWith({ userId: 'google-user-id', secret: 'google-secret' });
    expect(mockPersistSession).toHaveBeenCalledWith({ secret: 'google-session-secret' });
    expect(result.current.step).toBe('complete');
  });
});
