/**
 * AuthGate — Appwrite session creation retry tests.
 *
 * Tests the bounded retry-with-backoff behavior when createAppwriteSession fails.
 * Uses fake timers to control setTimeout-based backoff.
 */

jest.mock('@/global.css', () => ({}), { virtual: true });

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-navigation-bar', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
  setButtonStyleAsync: jest.fn().mockResolvedValue(undefined),
  setBorderColorAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  return {
    Slot: () => React.createElement(View, null, React.createElement(Text, null, 'Slot')),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
    useLocalSearchParams: () => ({}),
    Link: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockGetToken = jest.fn().mockResolvedValue('fake-token');

jest.mock('@clerk/clerk-expo', () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    isLoaded: true,
    getToken: mockGetToken,
  })),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoading: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/fonts', () => ({
  useClayFonts: () => [true, null] as [boolean, null],
}));

jest.mock('@/components/auth/AuthScreen', () => {
  const React = require('react');
  const { Text } = require('react-native');
  const AuthScreen = () => React.createElement(Text, null, 'AuthScreen');
  return { __esModule: true, default: AuthScreen };
});

jest.mock('@/components/clay/ClaySpinner', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { ClaySpinner: () => React.createElement(Text, null, 'Loading') };
});

jest.mock('@/lib/logger', () => ({
  addLog: jest.fn(),
}));

import React from 'react';
import { render, act } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';
import { createAppwriteSession } from '@/lib/auth-bridge';

const mockCreateAppwriteSession = createAppwriteSession as jest.Mock;

describe('AuthGate — Appwrite session retry', () => {
  let mockUseAuth: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateAppwriteSession.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('fake-token');
    jest.useFakeTimers();
    mockUseAuth = (jest.requireMock('@clerk/clerk-expo') as { useAuth: jest.Mock }).useAuth;
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      getToken: mockGetToken,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('retries with 1s backoff on first failure, succeeds on retry, no third call', async () => {
    mockCreateAppwriteSession
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({});

    await act(async () => { render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(2);
  });

  it('stops after 4 total attempts (1 initial + 3 retries) when all fail', async () => {
    mockCreateAppwriteSession.mockRejectedValue(new Error('Network error'));

    await act(async () => { render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(2000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(3);

    await act(async () => { jest.advanceTimersByTime(4000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(4);

    await act(async () => { jest.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(4);
  });

  it('resets retry state on sign-out then sign-in', async () => {
    mockCreateAppwriteSession.mockRejectedValue(new Error('Network error'));

    await act(async () => { render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(1);

    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      getToken: mockGetToken,
    });
    const utils = await act(async () => { return render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });

    mockCreateAppwriteSession.mockReset();
    mockCreateAppwriteSession.mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      getToken: mockGetToken,
    });
    await act(async () => { utils.rerender(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(mockCreateAppwriteSession).toHaveBeenCalledTimes(1);
  });
});
