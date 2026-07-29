/**
 * AuthGate — Appwrite bridge: instant shell + retry + soft failure banner.
 *
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

jest.mock('@clerk/expo', () => ({
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
  CLAY_FONTS: { regular: 'Inter_400Regular', medium: 'Inter_500Medium', semibold: 'Inter_600SemiBold' },
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
import { render, act, fireEvent } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';
import { ensureAppwriteSession } from '@/lib/auth-bridge';

const mockEnsureAppwriteSession = ensureAppwriteSession as jest.Mock;

describe('AuthGate — Appwrite bridge', () => {
  let mockUseAuth: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEnsureAppwriteSession.mockReset();
    mockGetToken.mockReset();
    mockGetToken.mockResolvedValue('fake-token');
    jest.useFakeTimers();
    mockUseAuth = (jest.requireMock('@clerk/expo') as { useAuth: jest.Mock }).useAuth;
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      getToken: mockGetToken,
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders Slot immediately while bridge is pending (instant shell)', async () => {
    let resolveBridge!: (v: unknown) => void;
    mockEnsureAppwriteSession.mockReturnValue(
      new Promise((resolve) => {
        resolveBridge = resolve;
      }),
    );

    const { queryByText } = await act(async () => render(<RootLayout />));
    await act(async () => {
      await Promise.resolve();
    });

    expect(queryByText('Slot')).toBeTruthy();
    expect(queryByText(/Retry/i)).toBeNull();

    await act(async () => {
      resolveBridge({});
    });
    expect(queryByText('Slot')).toBeTruthy();
  });

  it('retries with 1s backoff on first failure, succeeds on retry, no third call', async () => {
    mockEnsureAppwriteSession
      .mockRejectedValueOnce(new Error('bridge_failed'))
      .mockResolvedValueOnce({});

    await act(async () => { render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);

    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(2);
  });

  it('stops after 4 total attempts and shows Retry banner without unmounting Slot', async () => {
    mockEnsureAppwriteSession.mockRejectedValue(new Error('bridge_failed'));

    const { queryByText, getByText } = await act(async () => render(<RootLayout />));
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);
    expect(queryByText('Slot')).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(2);

    await act(async () => { jest.advanceTimersByTime(2000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(3);

    await act(async () => { jest.advanceTimersByTime(4000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(4);

    await act(async () => { jest.advanceTimersByTime(10000); await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(4);
    expect(queryByText('Slot')).toBeTruthy();
    expect(getByText(/Retry/i)).toBeTruthy();
  });

  it('Retry button re-runs the bridge', async () => {
    mockEnsureAppwriteSession.mockRejectedValue(new Error('bridge_failed'));

    const { getByText } = await act(async () => render(<RootLayout />));
    await act(async () => { await Promise.resolve(); });

    await act(async () => { jest.advanceTimersByTime(1000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(2000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(4000); await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(getByText(/Retry/i)).toBeTruthy();
    const callsBefore = mockEnsureAppwriteSession.mock.calls.length;

    mockEnsureAppwriteSession.mockReset();
    mockEnsureAppwriteSession.mockResolvedValue({});

    await act(async () => {
      fireEvent.press(getByText(/Retry/i));
    });
    await act(async () => { await Promise.resolve(); });

    expect(mockEnsureAppwriteSession.mock.calls.length).toBeGreaterThan(0);
    expect(callsBefore).toBeGreaterThan(0);
  });

  it('does not re-bridge when Clerk getToken identity changes', async () => {
    mockEnsureAppwriteSession.mockResolvedValue({});

    const { rerender } = await act(async () => render(<RootLayout />));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);

    // Simulate Clerk returning a new getToken function every render.
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      getToken: jest.fn().mockResolvedValue('fake-token'),
    });
    await act(async () => {
      rerender(<RootLayout />);
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);
  });

  it('resets retry state on sign-out then sign-in', async () => {
    mockEnsureAppwriteSession.mockRejectedValue(new Error('bridge_failed'));

    await act(async () => { render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);

    mockUseAuth.mockReturnValue({
      isSignedIn: false,
      isLoaded: true,
      getToken: mockGetToken,
    });
    const utils = await act(async () => { return render(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });

    mockEnsureAppwriteSession.mockReset();
    mockEnsureAppwriteSession.mockResolvedValue({});
    mockUseAuth.mockReturnValue({
      isSignedIn: true,
      isLoaded: true,
      getToken: mockGetToken,
    });
    await act(async () => { utils.rerender(<RootLayout />); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { await Promise.resolve(); });

    expect(mockEnsureAppwriteSession).toHaveBeenCalledTimes(1);
  });
});
