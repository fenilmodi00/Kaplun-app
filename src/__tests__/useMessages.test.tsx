jest.mock('@/lib/repository', () => ({
  listMessages: jest.fn(),
  sendMessage: jest.fn(),
  batchMarkAsRead: jest.fn(),
}));

jest.mock('@/lib/bridge-context', () => ({
  useBridge: () => ({ isReady: true }),
}));

import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMessages } from '@/hooks/useMessages';
import { useRealtimeSubscription } from '@/lib/realtime';
import * as repository from '@/lib/repository';
import { createQueryClientWrapper } from '@/testing/test-utils';
import type { Message } from '@/lib/types';

const mockListMessages = repository.listMessages as jest.Mock;
const mockUseRealtimeSubscription = useRealtimeSubscription as jest.Mock;

const mockMessage: Message = {
  $id: 'msg_1',
  message_id: 'msg_1',
  thread_id: 'thread_1',
  sender_type: 'brand',
  body: 'hello',
  attachments: '',
  agent_name: null,
  is_read: false,
  timestamp: '2026-08-11T00:00:00Z',
};

describe('useMessages realtime', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('appends own-thread events, ignores foreign threads, refetches on synthetic no-payload events', async () => {
    mockListMessages.mockResolvedValue([mockMessage]);

    const { result, unmount } = await renderHook(() => useMessages('thread_1'), {
      wrapper: createQueryClientWrapper(),
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
    expect(result.current.messages).toEqual([mockMessage]);
    expect(mockListMessages).toHaveBeenCalledTimes(1);

    const calls = mockUseRealtimeSubscription.mock.calls;
    const callback = calls[calls.length - 1]?.[1] as ((event: unknown) => void) | undefined;
    expect(callback).toBeDefined();

    act(() => {
      callback!({
        events: ['tablesdb.db.tables.messages.rows.*.create'],
        channels: ['tablesdb.db.tables.messages.rows.create'],
        timestamp: '',
        payload: { ...mockMessage, $id: 'msg_2', message_id: 'msg_2', body: 'new' },
      });
    });
    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });
    expect(mockListMessages).toHaveBeenCalledTimes(1);

    act(() => {
      callback!({
        events: ['tablesdb.db.tables.messages.rows.*.create'],
        channels: ['tablesdb.db.tables.messages.rows.create'],
        timestamp: '',
        payload: { ...mockMessage, $id: 'msg_3', message_id: 'msg_3', thread_id: 'other_thread' },
      });
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(result.current.messages).toHaveLength(2);

    // Synthetic payload-less event (subscribe success / app foreground, e.g.
    // returning from Instagram OAuth) must not crash and must refetch.
    act(() => {
      callback!({ events: ['*'], channels: ['tablesdb.db.tables.messages.rows.create'], timestamp: '' });
    });
    await waitFor(() => {
      expect(mockListMessages).toHaveBeenCalledTimes(2);
    });

    await unmount();
  });
});
