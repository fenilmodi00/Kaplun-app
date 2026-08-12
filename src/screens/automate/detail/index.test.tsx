/**
 * Automation Detail screen integration tests.
 *
 * Tests: log rows render, pause/resume toggles status, delete shows confirm.
 * Mocks useAutomations + useAutomationLogs and useLocalSearchParams.
 */

jest.mock('@/hooks/useAutomations', () => ({
  useAutomations: jest.fn(),
  useAutomationLogs: jest.fn(),
  useAutomationStats: jest.fn(),
}));

// Override the expo-router mock to provide an automationId
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => ({ automationId: 'auto-1' }),
  Link: ({ children }: { children: React.ReactNode }) => children,
}));

import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import AutomationDetail from '@/screens/automate/detail';
import { useAutomations, useAutomationLogs, useAutomationStats } from '@/hooks/useAutomations';

const mockUseAutomations = useAutomations as jest.Mock;
const mockUseAutomationLogs = useAutomationLogs as jest.Mock;
const mockUseAutomationStats = useAutomationStats as jest.Mock;

const mockAutomation = {
  $id: 'auto-1',
  clerk_user_id: 'user-1',
  ig_user_id: 'ig-1',
  name: 'Test Automation',
  target_type: 'all_posts' as const,
  media_ids: [],
  bound_media_ids: [],
  keywords: ['collab', 'partner'],
  match_mode: 'whole_word' as const,
  opening_dm_mode: 'direct' as const,
  dm_message: 'Hey! Love your content. Want to collab?',
  button_text: null,
  reveal_message: null,
  public_reply_enabled: true,
  public_reply_message: null,
  status: 'active' as const,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockLogs = [
  {
    $id: 'log-1',
    automation_id: 'auto-1',
    comment_id: 'c1',
    commenter_username: 'alice_insta',
    comment_text: 'I want to collab with you!',
    matched_keyword: 'collab',
    action: 'dm_sent' as const,
    reason: null,
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    $id: 'log-2',
    automation_id: 'auto-1',
    comment_id: 'c2',
    commenter_username: 'bob_posts',
    comment_text: 'Random comment',
    matched_keyword: null,
    action: 'skipped' as const,
    reason: 'no_keyword_match',
    created_at: new Date(Date.now() - 600000).toISOString(),
  },
  {
    $id: 'log-3',
    automation_id: 'auto-1',
    comment_id: 'c3',
    commenter_username: 'charlie_err',
    comment_text: 'Partner up?',
    matched_keyword: 'partner',
    action: 'failed' as const,
    reason: 'rate_limited',
    created_at: new Date(Date.now() - 900000).toISOString(),
  },
];

const defaultAutomationsReturn = {
  automations: [mockAutomation],
  loading: false,
  error: null,
  refresh: jest.fn(),
  toggleStatus: jest.fn(),
  createAutomation: jest.fn(),
  deleteAutomation: jest.fn(),
  creating: false,
};

const defaultLogsReturn = {
  logs: mockLogs,
  loading: false,
  error: null,
  refresh: jest.fn(),
};

describe('AutomationDetail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAutomations.mockReturnValue(defaultAutomationsReturn);
    mockUseAutomationLogs.mockReturnValue(defaultLogsReturn);
    mockUseAutomationStats.mockReturnValue({
      stats: { sent: 1, skipped: 1, failed: 1 },
      loading: false,
      error: null,
      refresh: jest.fn(),
    });
  });

  // ── Rendering ──

  it('renders automation name and status badge', async () => {
    const { getByText } = await render(<AutomationDetail />);
    expect(getByText('Test Automation')).toBeTruthy();
    expect(getByText('active')).toBeTruthy();
  });

  it('renders config summary card', async () => {
    const { getByText } = await render(<AutomationDetail />);
    expect(getByText('Configuration')).toBeTruthy();
    expect(getByText('All posts')).toBeTruthy();
    expect(getByText('collab, partner')).toBeTruthy();
    expect(getByText('whole word')).toBeTruthy();
    expect(getByText('On')).toBeTruthy();
  });

  it('renders stats strip from logs', async () => {
    const { getAllByText } = await render(<AutomationDetail />);
    // 1 sent, 1 skipped, 1 failed
    expect(getAllByText('1')).toHaveLength(3);
    expect(getAllByText('Sent')).toHaveLength(2);
    expect(getAllByText('Skipped')).toHaveLength(2);
    expect(getAllByText('Failed')).toHaveLength(2);
  });

  it('renders log rows with username, action badge, and matched keyword', async () => {
    const { getByText, getAllByText } = await render(<AutomationDetail />);

    // Username
    expect(getByText('alice_insta')).toBeTruthy();
    expect(getByText('bob_posts')).toBeTruthy();
    expect(getByText('charlie_err')).toBeTruthy();

    // Action badges appear in stats strip + log rows
    expect(getAllByText('Sent')).toHaveLength(2);
    expect(getAllByText('Skipped')).toHaveLength(2);
    expect(getAllByText('Failed')).toHaveLength(2);

    // Matched keyword chip
    expect(getByText('collab')).toBeTruthy();
    expect(getByText('partner')).toBeTruthy();
  });

  it('shows empty state when no logs', async () => {
    mockUseAutomationLogs.mockReturnValue({
      ...defaultLogsReturn,
      logs: [],
    });
    const { getByText } = await render(<AutomationDetail />);
    expect(
      getByText(/No activity yet/),
    ).toBeTruthy();
  });

  it('shows not-found when automation is missing', async () => {
    mockUseAutomations.mockReturnValue({
      ...defaultAutomationsReturn,
      automations: [],
    });
    const { getByText } = await render(<AutomationDetail />);
    expect(getByText('Automation not found')).toBeTruthy();
  });

  // ── Actions ──

  it('status switch calls toggleStatus', async () => {
    const toggleStatus = jest.fn();
    mockUseAutomations.mockReturnValue({
      ...defaultAutomationsReturn,
      toggleStatus,
    });

    const { getByRole } = await render(<AutomationDetail />);
    const toggle = getByRole('switch');
    expect(toggle.props.value).toBe(true);

    await act(async () => {
      fireEvent(toggle, 'valueChange');
    });

    expect(toggleStatus).toHaveBeenCalledTimes(1);
    expect(toggleStatus).toHaveBeenCalledWith(mockAutomation);
  });

  it('switch is off when automation is paused', async () => {
    mockUseAutomations.mockReturnValue({
      ...defaultAutomationsReturn,
      automations: [{ ...mockAutomation, status: 'paused' as const }],
    });

    const { getByRole } = await render(<AutomationDetail />);
    expect(getByRole('switch').props.value).toBe(false);
  });

  it('delete confirms via Dialog then calls deleteAutomation', async () => {
    const deleteAutomation = jest.fn();
    mockUseAutomations.mockReturnValue({
      ...defaultAutomationsReturn,
      deleteAutomation,
    });

    const { getByText, getByLabelText, queryByText } = await render(<AutomationDetail />);

    // Dialog content mounts only after the trigger is pressed
    expect(queryByText('Delete Automation')).toBeNull();

    await act(async () => {
      fireEvent.press(getByText('Delete'));
    });

    expect(getByText('Delete Automation')).toBeTruthy();

    await act(async () => {
      fireEvent.press(getByLabelText('Confirm delete'));
    });

    expect(deleteAutomation).toHaveBeenCalledTimes(1);
    expect(deleteAutomation).toHaveBeenCalledWith('auto-1');
  });
});
