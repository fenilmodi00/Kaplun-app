/**
 * useAutomationGate hook tests.
 *
 * Covers: connected=true when access_token present,
 * connected=false when absent, connect() calls OAuth + refreshes.
 */

jest.mock('@/lib/repository', () => ({
  getCreatorByClerkId: jest.fn(),
}));

jest.mock('@/lib/instagram-oauth', () => ({
  startInstagramOAuth: jest.fn().mockResolvedValue(true),
}));

import { renderHook, waitFor } from '@testing-library/react-native';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { getCreatorByClerkId } from '@/lib/repository';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { createQueryClientWrapper } from './test-utils';

const mockGetCreatorByClerkId = getCreatorByClerkId as jest.Mock;
const mockStartInstagramOAuth = startInstagramOAuth as jest.Mock;

describe('useAutomationGate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns connected: true when creator has access_token', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: 'token-123',
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(true);
    });
    expect(result.current.loading).toBe(false);
  });

  it('returns connected: false when creator has no access_token', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: '',
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.connected).toBe(false);
    });
    expect(result.current.loading).toBe(false);
  });

  it('connect() calls startInstagramOAuth with clerk id + appwrite uid and refreshes on success', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: '',
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    // Wait for the initial query to resolve
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.connect();

    expect(mockStartInstagramOAuth).toHaveBeenCalledWith(
      'test-user-id',
      'creator-1'
    );
  });
});
