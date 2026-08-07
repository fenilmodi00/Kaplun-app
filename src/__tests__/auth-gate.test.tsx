/**
 * AuthGate — Appwrite-native auth: loading / signed-out / signed-in states.
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

jest.mock('@/hooks/useAppwriteUser', () => ({
  useAppwriteUser: jest.fn(),
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
import { render } from '@testing-library/react-native';
import RootLayout from '@/app/_layout';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';

const mockUseAppwriteUser = useAppwriteUser as jest.Mock;

describe('AuthGate — Appwrite native', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAppwriteUser.mockReturnValue({ data: null, isLoading: false });
  });

  it('shows loading spinner while user is loading', async () => {
    mockUseAppwriteUser.mockReturnValue({ data: null, isLoading: true });

    const { getByText } = await render(<RootLayout />);
    expect(getByText('Loading')).toBeTruthy();
  });

  it('shows AuthScreen when no user is authenticated', async () => {
    mockUseAppwriteUser.mockReturnValue({ data: null, isLoading: false });

    const { getByText, queryByText } = await render(<RootLayout />);
    expect(getByText('AuthScreen')).toBeTruthy();
    expect(queryByText('Slot')).toBeNull();
  });

  it('shows Slot when a user is authenticated', async () => {
    mockUseAppwriteUser.mockReturnValue({ data: { $id: 'user_abc' }, isLoading: false });

    const { getByText, queryByText } = await render(<RootLayout />);
    expect(getByText('Slot')).toBeTruthy();
    expect(queryByText('AuthScreen')).toBeNull();
  });
});
