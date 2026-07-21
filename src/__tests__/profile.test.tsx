/**
 * Profile screen integration tests.
 *
 * Tests all four states: loading, error, empty (no creator), and connected.
 * Mocks useCreatorProfile and useDashboard hooks.
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
  useClerk: () => ({
    signOut: jest.fn().mockResolvedValue(undefined),
  }),
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoaded: ({ children }: { children: React.ReactNode }) => children,
  ClerkLoading: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/hooks/useCreatorProfile', () => ({
  useCreatorProfile: jest.fn(),
}));

jest.mock('@/lib/instagram', () => ({
  disconnectInstagram: jest.fn(),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileScreen from '@/app/(tabs)/(profile)/index';
import { useCreatorProfile } from '@/hooks/useCreatorProfile';

const mockUseCreatorProfile = useCreatorProfile as jest.Mock;

const mockCreator = {
  $id: 'creator-1',
  ig_user_id: '12345',
  ig_username: 'test_creator',
  full_name: 'Test Creator',
  profile_pic_url: 'https://example.com/pic.jpg',
  bio: 'A test bio',
  follower_count: 1500,
  following_count: 500,
  media_count: 50,
  post_count: 50,
  is_verified: true,
  is_business: true,
  account_type: 'business' as const,
  external_url: '',
  niche: 'food',
  creator_tier: 'established_micro' as const,
  detected_language: 'en',
  language_hint: 'english',
  region: 'IN',
  detected_region: 'IN',
  has_brand_experience: true,
  has_brand_signals: true,
  brand_signal_count: 3,
  avg_reel_views: 2000,
  avg_views: 2000,
  engagement_rate: 5.2,
  reach_ratio: 0.8,
  access_token: '',
  token_expires_at: '',
  is_onboarded: true,
  clerk_user_id: 'test-user-id',
  username: 'test_creator',
  created_at: '2024-01-01T00:00:00Z',
  last_synced_at: '2024-01-01T00:00:00Z',
};

const defaultMockReturn = {
  creator: null,
  dealThreads: [],
  recentReels: [],
  recentMedia: [],
  insights: null,
  isLoading: false,
  error: null,
  refresh: jest.fn(),
};

describe('ProfileScreen', () => {
  beforeEach(() => {
    mockUseCreatorProfile.mockReturnValue(defaultMockReturn);
  });

  // ── Loading state ──

  it('shows loading spinner while profile loads', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      isLoading: true,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('Loading profile...')).toBeTruthy();
  });

  // ── Error state ──

  it('shows error message with retry button', async () => {
    const refresh = jest.fn();
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      error: 'Failed to fetch profile',
      refresh,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('Failed to fetch profile')).toBeTruthy();

    const retryButton = getByText('Retry');
    expect(retryButton).toBeTruthy();
    fireEvent.press(retryButton);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // ── Empty state (no creator connected) ──

  it('shows empty state when no Instagram account is connected', async () => {
    const { getByText } = await render(<ProfileScreen />);
    expect(getByText(/Connect your Instagram/)).toBeTruthy();
    expect(getByText('Refresh')).toBeTruthy();
  });

  // ── Connected state ──

  it('renders creator name and Instagram handle', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('Test Creator')).toBeTruthy();
    expect(getByText('@test_creator')).toBeTruthy();
  });

  it('renders follower, following, and post counts', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText(/1.5K followers/)).toBeTruthy();
    expect(getByText(/500 following/)).toBeTruthy();
    expect(getByText(/50 posts/)).toBeTruthy();
  });

  it('renders engagement rate and creator tier badges', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText(/5.2% engagement/)).toBeTruthy();
    expect(getByText(/established micro/)).toBeTruthy();
    expect(getByText(/food/)).toBeTruthy();
  });

  it('shows "No recent reels" when there are no reels', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
      recentReels: [],
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('No recent reels')).toBeTruthy();
  });

  it('shows insights unavailable message for non-business accounts', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
      insights: null,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(
      getByText('Insights available for business accounts only')
    ).toBeTruthy();
  });

  it('shows "No active deals" when there are no deal threads', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
      dealThreads: [],
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('No active deals')).toBeTruthy();
  });

  it('renders Disconnect and Sign Out buttons when connected', async () => {
    mockUseCreatorProfile.mockReturnValue({
      ...defaultMockReturn,
      creator: mockCreator,
    });

    const { getByText } = await render(<ProfileScreen />);
    expect(getByText('Disconnect Instagram')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
  });
});
