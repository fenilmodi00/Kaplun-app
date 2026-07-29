/**
 * Home Dashboard screen integration tests.
 *
 * Tests the connected state where Instagram is already linked.
 * Mocks fetchProfile to return a profile.
 */

// Mock Clerk before component imports — screens import from @clerk/expo
jest.mock('@clerk/expo', () => ({
  useAuth: () => ({
    isSignedIn: true,
    userId: 'test-user-id',
    getToken: jest.fn().mockResolvedValue('test-token'),
  }),
  useUser: () => ({
    user: {
      id: 'test-user-id',
      firstName: 'Test',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoading: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/appwrite', () => ({
  account: { createJWT: jest.fn().mockResolvedValue({ jwt: 'test-jwt' }) },
}));

jest.mock('@/lib/instagram', () => ({
  fetchProfile: jest.fn(),
  fetchMedia: jest.fn(),
  fetchInsights: jest.fn(),
  disconnectInstagram: jest.fn(),
}));

jest.mock('@/lib/instagram-oauth', () => ({
  startInstagramOAuth: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/auth-bridge', () => ({
  ensureAppwriteSession: jest.fn().mockResolvedValue({ $id: 'test-appwrite-id' }),
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

jest.mock('@/lib/repository', () => ({
  getCreatorByClerkId: jest.fn().mockResolvedValue(null),
}));

const mockDashboardData = {
  creator: {
    id: '12345',
    username: 'test_creator',
    name: 'Test Creator',
    followers_count: 1500,
    follows_count: 500,
    media_count: 42,
  },
  threads: [
    {
      $id: 'thread-1',
      campaign_title: 'Test Campaign',
      status: 'negotiating',
      unread_count: 2,
      last_message_at: new Date().toISOString(),
    },
  ],
  deals: [{ $id: 'deal-1', title: 'Test Deal' }],
};

jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: mockDashboardData,
    loading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import HomeScreen from '@/app/(tabs)/(home)/index';
import { fetchProfile } from '@/lib/instagram';

const mockFetchProfile = fetchProfile as jest.Mock;

const mockProfile = {
  id: '12345',
  username: 'test_creator',
  name: 'Test Creator',
  followers_count: 1500,
  follows_count: 500,
  media_count: 42,
};

describe('HomeScreen — Connected state', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchProfile.mockResolvedValue(mockProfile);
  });

  it('shows connection chip with Instagram handle when connected', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('@test_creator')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Connected status', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Connected')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Instagram DMs module', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Instagram DMs')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Latest post performance module', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Latest post performance')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Open Messages ghost button', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Open Messages')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows quick action buttons (New post, Reply to DMs)', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('New post')).toBeTruthy();
      expect(getByText('Reply to DMs')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Kaplun wordmark in header', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Kaplun')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });
});
