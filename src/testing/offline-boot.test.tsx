/**
 * Optimistic boot — SessionProvider paints cached UI from local state
 * while account.get() validates in the background.
 */

jest.mock('@/global.css', () => ({}), { virtual: true });

import React from 'react';
import { Text } from 'react-native';
import { render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SessionProvider, useSession } from '@/lib/session-context';
import { account } from '@/lib/appwrite';
import {
  restoreSession,
  clearStoredSession,
  isNetworkError,
  getAppwriteJWT,
} from '@/lib/auth-session';

function TestConsumer() {
  const { session, isLoading } = useSession();
  const state = isLoading ? 'loading' : session ? 'authenticated' : 'signed-out';
  return <Text>{state}</Text>;
}

async function renderProvider() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <TestConsumer />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

describe('Optimistic boot — SessionProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.EXPO_PUBLIC_IG_API_BASE_URL = 'http://test-api';
  });

  afterEach(() => {
    delete process.env.EXPO_PUBLIC_IG_API_BASE_URL;
  });

  it('shows authenticated when secret exists, even if account.get never resolves', async () => {
    (restoreSession as jest.Mock).mockResolvedValue('secret-123');
    (account.get as jest.Mock).mockImplementation(() => new Promise(() => {}));

    const { getByText } = await renderProvider();
    await waitFor(() => {
      expect(getByText('authenticated')).toBeTruthy();
    });
  });

  it('shows signed-out when no secret is stored', async () => {
    (restoreSession as jest.Mock).mockResolvedValue(null);

    const { getByText } = await renderProvider();
    await waitFor(() => {
      expect(getByText('signed-out')).toBeTruthy();
    });
  });

  it('signs out when account.get rejects with 401 (not a network error)', async () => {
    (restoreSession as jest.Mock).mockResolvedValue('secret-123');
    (account.get as jest.Mock).mockRejectedValue({ code: 401 });
    (isNetworkError as jest.Mock).mockReturnValue(false);

    const { getByText } = await renderProvider();
    await waitFor(() => {
      expect(getByText('signed-out')).toBeTruthy();
    });
    expect(clearStoredSession).toHaveBeenCalled();
  });

  it('stays authenticated when account.get throws TypeError (network error)', async () => {
    (restoreSession as jest.Mock).mockResolvedValue('secret-123');
    (account.get as jest.Mock).mockRejectedValue(new TypeError('fetch failed'));
    (isNetworkError as jest.Mock).mockReturnValue(true);

    const { getByText } = await renderProvider();
    await waitFor(() => {
      expect(getByText('authenticated')).toBeTruthy();
    });
    expect(clearStoredSession).not.toHaveBeenCalled();
  });

  it('fires ensure-profile on successful background validation', async () => {
    (restoreSession as jest.Mock).mockResolvedValue('secret-123');
    (account.get as jest.Mock).mockResolvedValue({ $id: 'user-1' });
    (getAppwriteJWT as jest.Mock).mockResolvedValue('jwt-token');
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response());

    const { getByText } = await renderProvider();
    await waitFor(() => {
      expect(getByText('authenticated')).toBeTruthy();
    });
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('http://test-api/auth/ensure-profile', expect.objectContaining({
        method: 'POST',
        headers: { Authorization: 'Bearer jwt-token' },
      }));
    });

    fetchSpy.mockRestore();
  });
});
