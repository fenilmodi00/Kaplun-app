/**
 * useAutomations + useAutomationLogs hook tests.
 *
 * Tests all four states: loading, data, error, and toggleStatus mutation.
 * Mocks @/lib/automations at the module level.
 */

jest.mock('@/lib/automations', () => ({
  listAutomations: jest.fn(),
  updateAutomation: jest.fn(),
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  listAutomationLogs: jest.fn(),
}));

jest.mock('@/hooks/useAppwriteUser', () => ({
  useAppwriteUser: () => ({ data: { $id: 'test-user-id' }, isLoading: false }),
}));

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useAutomations, useAutomationLogs } from '@/hooks/useAutomations';
import * as automations from '@/lib/automations';
import { createQueryClientWrapper } from './test-utils';
import type { Automation, AutomationLog } from '@/lib/automations';

const mockListAutomations = automations.listAutomations as jest.Mock;
const mockUpdateAutomation = automations.updateAutomation as jest.Mock;
const mockListAutomationLogs = automations.listAutomationLogs as jest.Mock;

const mockAutomation: Automation = {
  $id: 'auto_1',
  clerk_user_id: 'clerk_user_1',
  ig_user_id: 'ig_user_1',
  name: 'Test Automation',
  target_type: 'all_posts',
  media_ids: [],
  bound_media_ids: [],
  keywords: ['hello', 'world'],
  match_mode: 'whole_word',
  match_any_word: false,
  opening_dm_mode: 'direct',
  dm_message: 'Thanks for your comment!',
  button_text: null,
  reveal_message: null,
  public_reply_enabled: false,
  public_reply_message: null,
  public_reply_messages: [],
  require_follow: false,
  follow_prompt_message: null,
  follow_prompt_button_label: null,
  follow_up_enabled: false,
  follow_up_message: null,
  follow_up_delay_minutes: null,
  dm_trigger_enabled: false,
  status: 'active',
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
};

const mockLog: AutomationLog = {
  $id: 'log_1',
  automation_id: 'auto_1',
  comment_id: 'comment_1',
  commenter_username: 'test_user',
  comment_text: 'hello world',
  matched_keyword: 'hello',
  action: 'dm_sent',
  reason: null,
  created_at: '2026-07-29T00:00:00Z',
};

describe('useAutomations', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Loading state ──

  it('returns loading: true while data is being fetched', async () => {
    let resolvePromise!: (value: Automation[]) => void;
    const deferred = new Promise<Automation[]>((resolve) => { resolvePromise = resolve; });
    mockListAutomations.mockReturnValue(deferred);

    const { result, unmount } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.automations).toEqual([]);
    expect(result.current.error).toBeNull();

    resolvePromise([]);
    await unmount();
  });

  // ── Data state ──

  it('returns automations array when data loads', async () => {
    mockListAutomations.mockResolvedValue([mockAutomation]);

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.automations).toEqual([mockAutomation]);
    expect(result.current.error).toBeNull();
  });

  it('returns empty array when no automations exist', async () => {
    mockListAutomations.mockResolvedValue([]);

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.automations).toEqual([]);
    expect(result.current.error).toBeNull();
  });

  // ── Error state ──

  it('returns error string when query fails', async () => {
    mockListAutomations.mockRejectedValue(new Error('Failed to load automations'));

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load automations');
    });

    expect(result.current.automations).toEqual([]);
  });

  it('maps session_expired error to session_expired string', async () => {
    mockListAutomations.mockRejectedValue(new Error('session_expired'));

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('session_expired');
    });
  });

  // ── toggleStatus mutation ──

  it('toggleStatus calls updateAutomation with flipped status and invalidates query', async () => {
    mockListAutomations.mockResolvedValue([mockAutomation]);
    mockUpdateAutomation.mockResolvedValue({ ...mockAutomation, status: 'paused' });

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    // Wait for initial query to settle
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Toggle active → paused
    await result.current.toggleStatus(mockAutomation);

    expect(mockUpdateAutomation).toHaveBeenCalledTimes(1);
    expect(mockUpdateAutomation).toHaveBeenCalledWith(
      mockAutomation.$id,
      { status: 'paused' },
    );

    // Invalidation should cause listAutomations to be called again
    expect(mockListAutomations).toHaveBeenCalledTimes(2);
  });

  it('toggleStatus flips paused → active', async () => {
    const pausedAutomation = { ...mockAutomation, status: 'paused' as const };
    mockListAutomations.mockResolvedValue([pausedAutomation]);
    mockUpdateAutomation.mockResolvedValue({ ...pausedAutomation, status: 'active' });

    const { result } = await renderHook(() => useAutomations(), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    await result.current.toggleStatus(pausedAutomation);

    expect(mockUpdateAutomation).toHaveBeenCalledWith(
      pausedAutomation.$id,
      { status: 'active' },
    );
  });
});

describe('useAutomationLogs', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns loading: true while logs are being fetched', async () => {
    let resolvePromise!: (value: AutomationLog[]) => void;
    const deferred = new Promise<AutomationLog[]>((resolve) => { resolvePromise = resolve; });
    mockListAutomationLogs.mockReturnValue(deferred);

    const { result, unmount } = await renderHook(() => useAutomationLogs('auto_1'), {
      wrapper: createQueryClientWrapper(),
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.logs).toEqual([]);

    resolvePromise([]);
    await unmount();
  });

  it('returns logs array when data loads', async () => {
    mockListAutomationLogs.mockResolvedValue([mockLog]);

    const { result } = await renderHook(() => useAutomationLogs('auto_1'), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.logs).toEqual([mockLog]);
    expect(result.current.error).toBeNull();
  });

  it('returns error string when query fails', async () => {
    mockListAutomationLogs.mockRejectedValue(new Error('Failed to load logs'));

    const { result } = await renderHook(() => useAutomationLogs('auto_1'), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.error).toBe('Failed to load logs');
    });
  });

  it('is disabled when automationId is empty', async () => {
    const { result } = await renderHook(() => useAutomationLogs(''), {
      wrapper: createQueryClientWrapper(),
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.logs).toEqual([]);
    expect(mockListAutomationLogs).not.toHaveBeenCalled();
  });
});
