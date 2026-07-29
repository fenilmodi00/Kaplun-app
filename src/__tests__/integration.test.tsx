import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import Home from '@/app/(tabs)/(home)/index';
import { fetchMedia, fetchInsights, disconnectInstagram, fetchProfile } from '@/lib/instagram';
import { startInstagramOAuth } from '@/lib/instagram-oauth';

const mockFetchMedia = fetchMedia as jest.Mock;
const mockFetchInsights = fetchInsights as jest.Mock;
const mockDisconnectInstagram = disconnectInstagram as jest.Mock;
const mockStartInstagramOAuth = startInstagramOAuth as jest.Mock;
const mockFetchProfile = fetchProfile as jest.Mock;

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
  useClerk: () => ({
    signOut: jest.fn().mockResolvedValue(undefined),
  }),
  useSignIn: () => ({
    signIn: {
      create: jest.fn().mockResolvedValue({ status: 'complete' }),
      finalize: jest.fn().mockResolvedValue(undefined),
      status: 'complete',
    },
  }),
  useSignUp: () => ({
    signUp: {
      create: jest.fn().mockResolvedValue({ status: 'missing_requirements' }),
      finalize: jest.fn().mockResolvedValue(undefined),
      status: 'missing_requirements',
      verifications: {
        sendEmailCode: jest.fn().mockResolvedValue(undefined),
        verifyEmailCode: jest.fn().mockResolvedValue(undefined),
      },
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
      await render(<Home />);

      expect(screen.getByText('@testuser')).toBeTruthy();
      expect(screen.getByText('Connected')).toBeTruthy();
    });

    it('shows connected chip after successful login', async () => {
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
