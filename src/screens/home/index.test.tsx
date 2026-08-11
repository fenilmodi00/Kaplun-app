/**
 * Home Dashboard screen integration tests.
 *
 * Tests the connected state where Instagram is already linked.
 * Mocks fetchProfile to return a profile.
 */

jest.mock('@/hooks/useAppwriteUser', () => ({
  useAppwriteUser: () => ({ data: { $id: 'test-user-id' }, isLoading: false }),
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
  getCreatorByClerkId: jest.fn().mockResolvedValue({
    $id: 'creator-1',
    clerk_user_id: 'test-user-id',
    ig_user_id: '12345',
    username: 'test_creator',
    full_name: 'Test Creator',
    follower_count: 1500,
    following_count: 500,
    media_count: 42,
    profile_pic_url: '',
    access_token: 'ig-token-plaintext',
    token_expires_at: '2099-01-01T00:00:00.000Z',
    is_onboarded: true,
  }),
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
import HomeScreen from '@/screens/home';
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

  it('shows quick action buttons (Reply to DMs, View insights)', async () => {
    const { getByText, getAllByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Reply to DMs')).toBeTruthy();
      // "View insights" appears on the module CTA and the quick-action chip.
      expect(getAllByText('View insights').length).toBeGreaterThanOrEqual(1);
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Kaplun wordmark in header', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Kaplun')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });
});
