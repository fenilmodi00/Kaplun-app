/**
 * Thread Detail screen integration tests.
 *
 * Tests all states: loading, error, and messages list with input bar.
 * Mocks useMessages hook and useLocalSearchParams for threadId.
 */

jest.mock('@/hooks/useMessages', () => ({
  useMessages: jest.fn(),
}));

// Override the expo-router mock to provide a threadId
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ threadId: 'thread-1' }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ThreadDetail from '@/app/(tabs)/(messages)/[threadId]';
import { useMessages } from '@/hooks/useMessages';
import { tablesDB } from '@/lib/appwrite';

const mockUseMessages = useMessages as jest.Mock;

// Mock tablesDB.getRow to return thread details (status, campaign_title, etc.)
const mockGetRow = tablesDB.getRow as jest.Mock;
mockGetRow.mockResolvedValue({
  $id: 'thread-1',
  thread_id: 't1',
  status: 'negotiating',
  campaign_title: 'Spice Brand Campaign',
  agent_assigned: 'Priya (Negotiator)',
  ig_user_id: '12345',
  ig_username: 'test_creator',
  unread_count: 0,
  last_message_at: new Date().toISOString(),
  created_at: '2024-01-01T00:00:00Z',
});

const mockMessages = [
  {
    $id: 'msg-1',
    message_id: 'm1',
    thread_id: 'thread-1',
    sender_type: 'agent' as const,
    body: 'Hi! We love your content and would like to collaborate.',
    attachments: '[]',
    agent_name: 'Priya (Negotiator)',
    is_read: true,
    timestamp: new Date(Date.now() - 86400000).toISOString(),
  },
  {
    $id: 'msg-2',
    message_id: 'm2',
    thread_id: 'thread-1',
    sender_type: 'creator' as const,
    body: 'Sounds great! What are the terms?',
    attachments: '[]',
    agent_name: null,
    is_read: true,
    timestamp: new Date(Date.now() - 43200000).toISOString(),
  },
  {
    $id: 'msg-3',
    message_id: 'm3',
    thread_id: 'thread-1',
    sender_type: 'system' as const,
    body: 'Deal terms have been updated.',
    attachments: '[]',
    agent_name: null,
    is_read: true,
    timestamp: new Date(Date.now() - 21600000).toISOString(),
  },
];

const defaultMockReturn = {
  messages: [],
  loading: false,
  error: null,
  sendMessage: jest.fn(),
  markAsRead: jest.fn(),
  refresh: jest.fn(),
};

describe('ThreadDetail', () => {
  beforeEach(() => {
    mockUseMessages.mockReturnValue(defaultMockReturn);
  });

  // ── Loading state ──

  it('shows loading spinner while messages load', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      loading: true,
    });

    const { getByText } = await render(<ThreadDetail />);
    expect(getByText('Loading messages...')).toBeTruthy();
  });

  // ── Error state ──

  it('shows error message with retry button', async () => {
    const refresh = jest.fn();
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      error: 'Failed to load messages',
      refresh,
    });

    const { getByText } = await render(<ThreadDetail />);
    expect(getByText('Failed to load messages')).toBeTruthy();

    const retryButton = getByText('Retry');
    expect(retryButton).toBeTruthy();
    fireEvent.press(retryButton);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  // ── Messages list ──

  it('renders agent message bubbles', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
    });

    const { getByText } = await render(<ThreadDetail />);
    expect(
      getByText(/Hi! We love your content/)
    ).toBeTruthy();
  });

  it('renders creator message bubbles', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
    });

    const { getByText } = await render(<ThreadDetail />);
    expect(getByText(/Sounds great!/)).toBeTruthy();
  });

  it('renders system messages', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
    });

    const { getByText } = await render(<ThreadDetail />);
    expect(getByText('Deal terms have been updated.')).toBeTruthy();
  });

  it('renders agent name labels on agent messages', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
    });

    const { getAllByText } = await render(<ThreadDetail />);
    // Appears in both the header and the message bubble
    expect(getAllByText('Priya (Negotiator)')).toHaveLength(2);
  });

  // ── Input bar ──

  it('renders message input and send button', async () => {
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
    });

    const { getByText, getByPlaceholderText } = await render(<ThreadDetail />);
    expect(getByPlaceholderText('Type a message...')).toBeTruthy();
    expect(getByText('Send')).toBeTruthy();
  });

  it('calls sendMessage when text is entered and Send is pressed', async () => {
    const sendMessage = jest.fn().mockResolvedValue(undefined);
    mockUseMessages.mockReturnValue({
      ...defaultMockReturn,
      messages: mockMessages,
      sendMessage,
    });

    const { getByText, getByPlaceholderText } = await render(<ThreadDetail />);

    const input = getByPlaceholderText('Type a message...');
    await fireEvent.changeText(input, 'Looking forward to it!');

    const sendButton = getByText('Send');
    await fireEvent.press(sendButton);

    expect(sendMessage).toHaveBeenCalledWith('Looking forward to it!');
  });
});
