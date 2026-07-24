/**
 * Instagram OAuth flow tests — expo-web-browser based authorization.
 *
 * Tests the startInstagramOAuth helper that opens Instagram's OAuth page
 * via expo-web-browser and checks the redirect URL for status=success.
 */

// Must mock before importing the module
jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('expo-linking', () => ({
  createURL: jest.fn((path: string) => `kaplun://${path}`),
}));

// Set env vars before importing the module under test
process.env.EXPO_PUBLIC_IG_APP_ID = 'test_app_id';
process.env.EXPO_PUBLIC_IG_OAUTH_REDIRECT_URI = 'https://test-callback.example.com/';

import { startInstagramOAuth } from '@/lib/instagram-oauth';

const mockOpenAuthSessionAsync =
  require('expo-web-browser').openAuthSessionAsync as jest.Mock;

const CLERK_ID = 'clerk123';
const APPWRITE_UID = 'uid456';

beforeEach(() => {
  mockOpenAuthSessionAsync.mockReset();
});

describe('startInstagramOAuth', () => {
  it('happy: returns true on successful redirect with status=success', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'kaplun://instagram-callback?status=success',
    });

    const result = await startInstagramOAuth(CLERK_ID, APPWRITE_UID);

    expect(result).toBe(true);
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledTimes(1);
    const [authUrl, redirectUrl] = mockOpenAuthSessionAsync.mock.calls[0];
    expect(authUrl).toContain('client_id=test_app_id');
    expect(authUrl).toContain('response_type=code');
    expect(authUrl).toContain('redirect_uri=https%3A%2F%2Ftest-callback.example.com%2F');
    expect(authUrl).toContain('state=');
    expect(redirectUrl).toBe('kaplun://instagram-callback');
  });

  it('cancel: throws when user cancels the browser', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'cancel',
    });

    await expect(
      startInstagramOAuth(CLERK_ID, APPWRITE_UID)
    ).rejects.toThrow('Instagram OAuth was cancelled');
  });

  it('dismiss: returns true (Expo Go intercepts exp:// redirect)', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'dismiss',
    });

    const result = await startInstagramOAuth(CLERK_ID, APPWRITE_UID);
    expect(result).toBe(true);
  });

  it('failure: throws when redirect URL has status=error', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'kaplun://instagram-callback?status=error',
    });

    await expect(
      startInstagramOAuth(CLERK_ID, APPWRITE_UID)
    ).rejects.toThrow('Instagram connection failed');
  });

  it('optimistic: returns true on unexpected result type (Expo Go behavior)', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'locked',
    });

    const result = await startInstagramOAuth(CLERK_ID, APPWRITE_UID);
    expect(result).toBe(true);
  });

  it('optimistic: returns true when redirect URL has no status parameter', async () => {
    mockOpenAuthSessionAsync.mockResolvedValueOnce({
      type: 'success',
      url: 'kaplun://instagram-callback',
    });

    const result = await startInstagramOAuth(CLERK_ID, APPWRITE_UID);
    expect(result).toBe(true);
  });
});
