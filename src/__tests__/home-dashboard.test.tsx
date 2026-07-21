/**
 * Home Dashboard screen integration tests.
 *
 * Tests the connected (dashboard) state where Instagram is already linked.
 * Mocks fetchProfile to return a profile and useDashboard to provide data.
 */

// Mock Clerk before component imports — screens import from @clerk/clerk-expo
jest.mock('@clerk/clerk-expo', () => ({
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

jest.mock('@/lib/instagram', () => ({
  fetchProfile: jest.fn(),
  loginInstagram: jest.fn(),
  fetchMedia: jest.fn(),
  fetchInsights: jest.fn(),
  disconnectInstagram: jest.fn(),
}));

const mockDashboardData = {
  creator: {
    pk: '12345',
    username: 'test_creator',
    full_name: 'Test Creator',
    follower_count: 1500,
    following_count: 500,
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
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import HomeScreen from '@/app/(tabs)/(home)/index';
import { fetchProfile, disconnectInstagram } from '@/lib/instagram';

const mockFetchProfile = fetchProfile as jest.Mock;
const mockDisconnectInstagram = disconnectInstagram as jest.Mock;

const mockProfile = {
  pk: '12345',
  username: 'test_creator',
  full_name: 'Test Creator',
  follower_count: 1500,
  following_count: 500,
  media_count: 42,
};

describe('HomeScreen — Dashboard (connected state)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetchProfile.mockResolvedValue(mockProfile);
  });

  it('shows welcome message with Instagram handle when connected', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText(/Welcome, @test_creator/)).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows campaign overview subtitle', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText(/Here's your campaign overview/)).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows stat cards (Active Deals, Unread Threads, Pending Content)', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Active Deals')).toBeTruthy();
      expect(getByText('Unread Threads')).toBeTruthy();
      expect(getByText('Pending Content')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows quick-link cards (View Messages, View Profile)', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('View Messages')).toBeTruthy();
      expect(getByText('View Profile')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows recent activity with thread title', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Test Campaign')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('shows Disconnect Instagram button', async () => {
    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Disconnect Instagram')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });
  });

  it('calls disconnectInstagram when Disconnect is pressed', async () => {
    mockDisconnectInstagram.mockResolvedValue(undefined);

    const { getByText } = await render(<HomeScreen />);

    await waitFor(() => {
      expect(getByText('Disconnect Instagram')).toBeTruthy();
    }, { timeout: 5000, interval: 100 });

    fireEvent.press(getByText('Disconnect Instagram'));

    await waitFor(() => {
      expect(mockDisconnectInstagram).toHaveBeenCalledTimes(1);
    });
  });
});
