jest.mock('@/hooks/useAppwriteUser', () => ({
  useAppwriteUser: () => ({ data: { $id: 'u1' } }),
}));

jest.mock('@/lib/bridge-context', () => ({
  useBridge: () => ({ isReady: true }),
}));

jest.mock('@/lib/instagram', () => ({
  fetchProfile: jest.fn(() => new Promise(() => {})),
  fetchAccountInsights: jest.fn(() => new Promise(() => {})),
  fetchMedia: jest.fn(() => new Promise(() => {})),
}));

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook } from '@testing-library/react-native';
import { useInsights } from '@/hooks/useInsights';
import type { InstagramAccountInsights } from '@/lib/instagram';

const cachedInsights: InstagramAccountInsights = {
  reach: [{ value: 10, endTime: '2026-08-01T00:00:00Z' }],
  followerCount: [],
  viewsTotal: 1,
  accountsEngagedTotal: 1,
  windowDays: 28,
};

describe('useInsights cache', () => {
  it('does not skeleton when the account query is already in the cache', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    client.setQueryData(['insightsAccount', 'u1', 28], cachedInsights);

    const { result } = await renderHook(() => useInsights(28), {
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.insights).toEqual(cachedInsights);
  });
});
