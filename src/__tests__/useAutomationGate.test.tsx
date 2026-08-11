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

jest.mock('@/lib/bridge-context', () => ({
  useBridge: () => ({ isReady: true, status: 'ready', retry: jest.fn(), setStatus: jest.fn() }),
}));

import { renderHook, waitFor, act } from '@testing-library/react-native';
import { useAutomationGate } from '@/hooks/useAutomationGate';
import { getCreatorByClerkId } from '@/lib/repository';
import { startInstagramOAuth } from '@/lib/instagram-oauth';
import { createQueryClientWrapper } from '@/testing/test-utils';

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
      expect(result.current.loading).toBe(false);
      expect(result.current.connected).toBe(true);
    });
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
      expect(result.current.loading).toBe(false);
      expect(result.current.connected).toBe(false);
    });
  });

  it('treats legacy enc1: tokens as usable now that the prefix gate is removed', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: 'enc1:cipher',
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.connected).toBe(true);
    });
  });

  it('connect() calls startInstagramOAuth with clerk id and verifies token was saved', async () => {
    let token = '';
    mockGetCreatorByClerkId.mockImplementation(async () => ({
      $id: 'creator-1',
      access_token: token,
    }));
    mockStartInstagramOAuth.mockImplementation(async () => {
      token = 'fresh-token';
      return true;
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await act(async () => {
      await result.current.connect();
    });

    expect(mockStartInstagramOAuth).toHaveBeenCalledWith(
      'test-appwrite-user-id',
      'test-appwrite-user-id'
    );
  });

  it('connect() throws when OAuth finishes without a usable token', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: '',
    });

    const { result } = await renderHook(() => useAutomationGate(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await expect(result.current.connect()).rejects.toThrow(/no usable token was saved/i);
  });
});
