/**
 * Automate home screen integration tests.
 *
 * Tests connection gate, empty state, list state, and toggle interaction.
 * Mocks useAutomations and getCreatorByClerkId.
 */

jest.mock('@/hooks/useAutomations', () => ({
  useAutomations: jest.fn(),
}));

jest.mock('@/lib/repository', () => ({
  getCreatorByClerkId: jest.fn(),
}));

jest.mock('@/lib/instagram-oauth', () => ({
  startInstagramOAuth: jest.fn().mockResolvedValue(true),
}));

jest.mock('@/lib/auth-bridge', () => ({
  ensureAppwriteSession: jest.fn().mockResolvedValue({ $id: 'test-appwrite-id' }),
}));

jest.mock('@/lib/bridge-context', () => ({
  useBridge: jest.fn().mockReturnValue({ isReady: true }),
}));

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import AutomateScreen from '@/app/(tabs)/(automate)/index';
import { useAutomations } from '@/hooks/useAutomations';
import { getCreatorByClerkId } from '@/lib/repository';

const mockUseAutomations = useAutomations as jest.Mock;
const mockGetCreatorByClerkId = getCreatorByClerkId as jest.Mock;

const defaultMockReturn = {
  automations: [],
  loading: false,
  error: null,
  refresh: jest.fn(),
  toggleStatus: jest.fn().mockResolvedValue(undefined),
  createAutomation: jest.fn().mockResolvedValue(undefined),
  deleteAutomation: jest.fn().mockResolvedValue(undefined),
  creating: false,
};

const mockAutomations = [
  {
    $id: 'auto-1',
    clerk_user_id: 'clerk-1',
    ig_user_id: 'ig-1',
    name: 'Welcome new followers',
    target_type: 'all_posts' as const,
    media_ids: [],
    bound_media_ids: [],
    keywords: ['hello', 'hi', 'hey'],
    match_mode: 'whole_word' as const,
    opening_dm_mode: 'direct' as const,
    dm_message: 'Thanks for commenting!',
    button_text: null,
    reveal_message: null,
    track_links: false,
    public_reply_enabled: false,
    public_reply_message: null,
    status: 'active' as const,
    created_at: '2026-07-29T00:00:00Z',
    updated_at: '2026-07-29T00:00:00Z',
  },
  {
    $id: 'auto-2',
    clerk_user_id: 'clerk-1',
    ig_user_id: 'ig-1',
    name: 'Promo code replies',
    target_type: 'specific_posts' as const,
    media_ids: ['media1', 'media2', 'media3'],
    bound_media_ids: [],
    keywords: ['discount', 'code'],
    match_mode: 'partial' as const,
    opening_dm_mode: 'direct' as const,
    dm_message: 'Use PROMO20 for 20% off!',
    button_text: null,
    reveal_message: null,
    track_links: false,
    public_reply_enabled: false,
    public_reply_message: null,
    status: 'paused' as const,
    created_at: '2026-07-29T00:00:00Z',
    updated_at: '2026-07-29T00:00:00Z',
  },
];

describe('AutomateScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAutomations.mockReturnValue(defaultMockReturn);
    // Default: connected creator
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: 'token-123',
      username: 'test_creator',
    });
  });

  // ── Connection gate ──

  it('shows connect CTA when Instagram is not connected', async () => {
    mockGetCreatorByClerkId.mockResolvedValue({
      $id: 'creator-1',
      access_token: '',
      username: 'test_creator',
    });

    const { getByText } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getByText('Connect Instagram to enable automations')).toBeTruthy();
    });
  });

  // ── Empty state ──

  it('shows create CTA when connected but no automations exist', async () => {
    const { getByText } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getByText('No automations yet')).toBeTruthy();
      expect(getByText('Create your first')).toBeTruthy();
    });
  });

  // ── List state ──

  it('renders both automation names in list state', async () => {
    mockUseAutomations.mockReturnValue({
      ...defaultMockReturn,
      automations: mockAutomations,
    });

    const { getByText } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getByText('Welcome new followers')).toBeTruthy();
      expect(getByText('Promo code replies')).toBeTruthy();
    });
  });

  it('renders target summaries for each automation', async () => {
    mockUseAutomations.mockReturnValue({
      ...defaultMockReturn,
      automations: mockAutomations,
    });

    const { getByText } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getByText('All posts')).toBeTruthy();
      expect(getByText('3 posts')).toBeTruthy();
    });
  });

  it('renders keywords preview for each automation', async () => {
    mockUseAutomations.mockReturnValue({
      ...defaultMockReturn,
      automations: mockAutomations,
    });

    const { getByText } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getByText('hello, hi, hey')).toBeTruthy();
      expect(getByText('discount, code')).toBeTruthy();
    });
  });

  // ── Toggle ──

  it('calls toggleStatus when Switch is toggled', async () => {
    const toggleStatus = jest.fn().mockResolvedValue(undefined);
    mockUseAutomations.mockReturnValue({
      ...defaultMockReturn,
      automations: mockAutomations,
      toggleStatus,
    });

    const { getAllByTestId } = await render(<AutomateScreen />);
    await waitFor(() => {
      expect(getAllByTestId('automation-switch')).toHaveLength(2);
    });

    const switches = getAllByTestId('automation-switch');
    fireEvent(switches[0], 'valueChange', false);
    expect(toggleStatus).toHaveBeenCalledWith(
      expect.objectContaining({ $id: 'auto-1' })
    );
  });
});
