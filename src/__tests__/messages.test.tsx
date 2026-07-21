/**
 * Messages screen integration tests.
 *
 * Tests all four states: loading, error, empty (no threads), and threads list.
 * Mocks the useThreads hook.
 */

jest.mock('@/hooks/useThreads', () => ({
  useThreads: jest.fn(),
}));

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MessagesScreen from '@/app/(tabs)/(messages)/index';
import { useThreads } from '@/hooks/useThreads';

const mockUseThreads = useThreads as jest.Mock;

const mockThreads = [
  {
    $id: 'thread-1',
    thread_id: 't1',
    ig_user_id: '12345',
    ig_username: 'test_creator',
    status: 'negotiating' as const,
    campaign_title: 'Spice Brand Campaign',
    deal_context: {
      budget: 50000,
      deliverables: ['1 reel', '1 story'],
      timeline: '2 weeks',
    },
    agent_assigned: 'Priya (Negotiator)',
    context_summary: 'Negotiating rate for spice brand reel',
    last_message_at: new Date().toISOString(),
    unread_count: 2,
    created_at: '2024-01-01T00:00:00Z',
    lastMessagePreview: 'Can we do 45k instead?',
  },
  {
    $id: 'thread-2',
    thread_id: 't2',
    ig_user_id: '12345',
    ig_username: 'test_creator',
    status: 'invited' as const,
    campaign_title: 'Fashion Collaboration',
    deal_context: {
      budget: 30000,
      deliverables: ['2 posts'],
      timeline: '1 week',
    },
    agent_assigned: 'Rahul (Outreach)',
    context_summary: 'Initial outreach for fashion collab',
    last_message_at: new Date(Date.now() - 3600000).toISOString(),
    unread_count: 0,
    created_at: '2024-01-02T00:00:00Z',
    lastMessagePreview: 'Hi! We love your content...',
  },
];

const defaultMockReturn = {
  threads: [],
  loading: false,
  error: null,
  refresh: jest.fn(),
};

describe('MessagesScreen', () => {
  beforeEach(() => {
    mockUseThreads.mockReturnValue(defaultMockReturn);
  });

  // ── Loading state ──

  it('shows loading spinner while threads load', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      loading: true,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText('Loading threads...')).toBeTruthy();
  });

  // ── Error state ──

  it('shows error message with retry button', async () => {
    const refresh = jest.fn();
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      error: 'Failed to load threads',
      refresh,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText('Failed to load threads')).toBeTruthy();

    const retryButton = getByText('Retry');
    expect(retryButton).toBeTruthy();
    fireEvent.press(retryButton);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // ── Empty state ──

  it('shows empty state when there are no deal threads', async () => {
    const { getByText } = await render(<MessagesScreen />);
    expect(
      getByText(/No deal threads yet/)
    ).toBeTruthy();
  });

  // ── Threads list ──

  it('renders thread campaign titles', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      threads: mockThreads,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText('Spice Brand Campaign')).toBeTruthy();
    expect(getByText('Fashion Collaboration')).toBeTruthy();
  });

  it('renders last message preview text', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      threads: mockThreads,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText(/Can we do 45k instead\?/)).toBeTruthy();
    expect(getByText(/Hi! We love your content/)).toBeTruthy();
  });

  it('renders status chips for each thread', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      threads: mockThreads,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText('negotiating')).toBeTruthy();
    expect(getByText('invited')).toBeTruthy();
  });

  it('renders agent names for threads', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      threads: mockThreads,
    });

    const { getByText } = await render(<MessagesScreen />);
    expect(getByText('Priya (Negotiator)')).toBeTruthy();
    expect(getByText('Rahul (Outreach)')).toBeTruthy();
  });

  it('shows unread badge count on threads with unread messages', async () => {
    mockUseThreads.mockReturnValue({
      ...defaultMockReturn,
      threads: mockThreads,
    });

    const { getByText } = await render(<MessagesScreen />);
    // thread-1 has unread_count=2
    expect(getByText('2')).toBeTruthy();
  });
});
