/**
 * Root auth layout — SessionProvider + Stack.Protected.
 */

jest.mock('@/global.css', () => ({}), { virtual: true });

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('expo-navigation-bar', () => ({
  NavigationBar: () => null,
  setBackgroundColorAsync: jest.fn().mockResolvedValue(undefined),
  setButtonStyleAsync: jest.fn().mockResolvedValue(undefined),
  setBorderColorAsync: jest.fn().mockResolvedValue(undefined),
  setStyle: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/lib/theme', () => ({
  useThemePreference: () => 'light',
  setThemePreference: jest.fn(),
  hydrateThemePreference: jest.fn().mockResolvedValue(undefined),
}));

const mockUseSession = jest.fn();

jest.mock('@/lib/session-context', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
  useSession: () => mockUseSession(),
}));

jest.mock('expo-router', () => {
  const React = require('react');
  const { View, Text } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) =>
    React.createElement(View, { testID: 'stack' }, children);
  Stack.Protected = ({
    guard,
    children,
  }: {
    guard: boolean;
    children: React.ReactNode;
  }) =>
    guard
      ? React.createElement(View, { testID: 'protected-open' }, children)
      : React.createElement(View, { testID: 'protected-closed' });
  Stack.Screen = ({ name }: { name: string }) =>
    React.createElement(Text, null, `screen:${name}`);
  const ThemeProvider = ({ children }: { children: React.ReactNode }) => children;
  return { Stack, ThemeProvider };
});

jest.mock('@/lib/fonts', () => ({
  useClayFonts: () => [true, null] as [boolean, null],
  CLAY_FONTS: {
    regular: 'Inter_400Regular',
    medium: 'Inter_500Medium',
    semibold: 'Inter_600SemiBold',
  },
}));

jest.mock('@/lib/bridge-context', () => ({
  BridgeProvider: ({ children }: { children: React.ReactNode }) => children,
  useBridge: () => ({
    status: 'ready',
    isReady: true,
    retry: jest.fn(),
    setStatus: jest.fn(),
    attemptKey: 0,
  }),
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';

describe('Root auth layout — SessionProvider + Protected', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading spinner while session is loading', async () => {
    mockUseSession.mockReturnValue({
      session: null,
      isLoading: true,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const { queryByText } = await render(<RootLayout />);
    expect(queryByText('screen:sign-in')).toBeNull();
    expect(queryByText('screen:(tabs)')).toBeNull();
  });

  it('opens sign-in when session is null', async () => {
    mockUseSession.mockReturnValue({
      session: null,
      isLoading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const { getByText, queryByText } = await render(<RootLayout />);
    await waitFor(() => {
      expect(getByText('screen:sign-in')).toBeTruthy();
    });
    expect(queryByText('screen:(tabs)')).toBeNull();
  });

  it('opens tabs when session is present', async () => {
    mockUseSession.mockReturnValue({
      session: 'session-secret',
      isLoading: false,
      signIn: jest.fn(),
      signOut: jest.fn(),
    });

    const { getByText, queryByText } = await render(<RootLayout />);
    await waitFor(() => {
      expect(getByText('screen:(tabs)')).toBeTruthy();
    });
    expect(queryByText('screen:sign-in')).toBeNull();
  });
});
