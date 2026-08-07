import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Home from '@/app/(tabs)/(home)/index';
import { fetchMedia, fetchInsights, disconnectInstagram, fetchProfile } from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { getCreatorByClerkId } from '@/lib/repository';

const mockGetCreator = getCreatorByClerkId as jest.Mock;

// Matches the connect gate: a creators row is "connected" only with an
// onboarded username and a stored token.
const connectedCreator = {
  $id: 'creator-1',
  clerk_user_id: 'test-user-id',
  ig_user_id: '1',
  username: 'testuser',
  access_token: 'plain-token',
  is_onboarded: true,
};

const mockFetchMedia = fetchMedia as jest.Mock;
const mockFetchInsights = fetchInsights as jest.Mock;
const mockDisconnectInstagram = disconnectInstagram as jest.Mock;
const mockStartInstagramOAuth = startInstagramOAuth as jest.Mock;
const mockFetchProfile = fetchProfile as jest.Mock;

jest.mock('@/hooks/useAppwriteUser', () => ({
  useAppwriteUser: () => ({ data: { $id: 'test-user-id' }, isLoading: false }),
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/lib/appwrite', () => ({
  account: {
    createJWT: jest.fn().mockResolvedValue({ jwt: 'test-jwt' }),
    get: jest.fn().mockResolvedValue({ $id: 'test-appwrite-id' }),
  },
}));

jest.mock('@/lib/instagram', () => ({
  fetchMedia: jest.fn(),
  fetchInsights: jest.fn(),
  disconnectInstagram: jest.fn(),
  fetchProfile: jest.fn().mockResolvedValue({
    id: '1',
    username: 'testuser',
    name: 'Test User',
    biography: 'A test bio',
    website: null,
    followers_count: 100,
    follows_count: 50,
    media_count: 10,
    profile_picture_url: 'https://example.com/pic.jpg',
  }),
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
  getCreatorByClerkId: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/hooks/useDashboard', () => ({
  useDashboard: () => ({
    data: { creator: null, threads: [], deals: [] },
    loading: false,
    error: null,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

describe('Integration Tests', () => {
  beforeEach(() => {
    mockFetchMedia.mockReset();
    mockFetchInsights.mockReset();
    mockDisconnectInstagram.mockReset();

    mockFetchMedia.mockResolvedValue([]);
    mockFetchInsights.mockResolvedValue({ data: [] });
  });

  describe('Home Screen', () => {
    it('renders connected state with username', async () => {
      mockGetCreator.mockResolvedValueOnce(connectedCreator);
      await render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('@testuser')).toBeTruthy();
        expect(screen.getByText('Connected')).toBeTruthy();
      });
    });

    it('shows connected chip after successful login', async () => {
      mockGetCreator.mockResolvedValueOnce(connectedCreator);
      await render(<Home />);

      await waitFor(() => {
        expect(screen.getByText('@testuser')).toBeTruthy();
      });
    });

    it('shows error text on login failure', async () => {
      mockFetchProfile.mockReset();
      mockFetchProfile.mockRejectedValue(new Error('not connected'));
      mockStartInstagramOAuth.mockReset();
      mockStartInstagramOAuth.mockRejectedValue(new Error('Invalid credentials'));

      await render(<Home />);

      await fireEvent.press(screen.getByText('Connect Instagram'));

      await waitFor(() => {
        expect(screen.getByText(/Invalid credentials/)).toBeTruthy();
      });
    });

    it('shows generic error text on Instagram connect failure', async () => {
      mockFetchProfile.mockReset();
      mockFetchProfile.mockRejectedValue(new Error('not connected'));
      mockStartInstagramOAuth.mockReset();
      mockStartInstagramOAuth.mockRejectedValue(new Error('Instagram connect failed'));

      await render(<Home />);

      await fireEvent.press(screen.getByText('Connect Instagram'));

      await waitFor(() => {
        expect(screen.getByText(/Instagram connect failed/)).toBeTruthy();
      });
    });

    it('shows inline error text on session_expired error', async () => {
      mockFetchProfile.mockReset();
      mockFetchProfile.mockRejectedValue(new Error('not connected'));
      mockStartInstagramOAuth.mockReset();
      mockStartInstagramOAuth.mockRejectedValue(new Error('session_expired'));

      await render(<Home />);

      await fireEvent.press(screen.getByText('Connect Instagram'));

      await waitFor(() => {
        expect(screen.getByText(/session_expired/)).toBeTruthy();
        expect(screen.getByText('Try again')).toBeTruthy();
      });
    });
  });
});
