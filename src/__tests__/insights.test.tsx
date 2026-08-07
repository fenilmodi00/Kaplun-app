/**
 * Insights dashboard screen tests.
 *
 * The data layer is mocked at the useInsights hook boundary so each state the
 * screen can render (loading, data, empty, session_expired, insights_permission,
 * generic error) is exercised directly.
 */

import React from 'react';
import { render, screen } from '@testing-library/react-native';

const mockUseInsights = jest.fn();
jest.mock('@/hooks/useInsights', () => ({
  useInsights: (days: number) => mockUseInsights(days),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
  useQuery: () => ({ data: { $id: 'test-user-id' }, isLoading: false }),
}));

import InsightsScreen from '@/app/(tabs)/(insights)/index';

const baseProfile = {
  id: '1',
  username: 'test_creator',
  name: 'Test Creator',
  biography: '',
  followers_count: 1500,
  follows_count: 500,
  media_count: 42,
  profile_picture_url: '',
};

const baseInsights = {
  reach: [
    { value: 150, endTime: '2026-07-29T07:00:00+0000' },
    { value: 120, endTime: '2026-07-30T07:00:00+0000' },
  ],
  followerCount: [
    { value: 1490, endTime: '2026-07-29T07:00:00+0000' },
    { value: 1500, endTime: '2026-07-30T07:00:00+0000' },
  ],
  viewsTotal: 4200,
  accountsEngagedTotal: 310,
  windowDays: 28,
};

const baseMedia = [
  {
    id: 'm1',
    caption: 'A post',
    media_type: 'IMAGE',
    thumbnail_url: 'https://example.com/img.jpg',
    media_url: null,
    permalink: 'https://instagram.com/p/abc',
    timestamp: '2026-07-30T00:00:00Z',
    like_count: 120,
    comments_count: 12,
    engagement: 132,
    imageUri: 'https://example.com/img.jpg',
  },
];

function mockState(overrides: Record<string, unknown> = {}) {
  mockUseInsights.mockReturnValue({
    profile: baseProfile,
    insights: baseInsights,
    topMedia: baseMedia,
    isLoading: false,
    isRefreshing: false,
    error: null,
    refresh: jest.fn(),
    ...overrides,
  });
}

beforeEach(() => {
  mockUseInsights.mockReset();
  mockState();
});

describe('InsightsScreen', () => {
  it('loading: renders header + toggle with a data skeleton below', async () => {
    mockState({ isLoading: true, insights: null, profile: null, topMedia: [] });
    await render(<InsightsScreen />);

    // Chrome never unmounts — only the data sections skeleton.
    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.queryByText('270')).toBeNull();
  });

  it('data: renders KPIs, charts and top posts from hook data', async () => {
    await render(<InsightsScreen />);

    expect(screen.getByText('Insights')).toBeTruthy();
    expect(screen.getByText('@test_creator · Last 28 days')).toBeTruthy();

    // KPI grid (values/labels intentionally repeat between KPI cards and
    // section cards — assert presence, not uniqueness)
    expect(screen.getAllByText('270').length).toBeGreaterThan(0); // reach total 150+120
    expect(screen.getByText('4.2K')).toBeTruthy(); // views total
    expect(screen.getByText('310')).toBeTruthy(); // engaged accounts
    expect(screen.getAllByText('1.5K').length).toBeGreaterThan(0); // followers 1500 compacted

    // Followers delta chip + section (labels are title-case; uppercase is styling only)
    expect(screen.getByText('+10')).toBeTruthy();
    expect(screen.getAllByText('Followers').length).toBeGreaterThan(0);

    // Reach section
    expect(screen.getAllByText('Reach').length).toBeGreaterThan(0);

    // Top posts
    expect(screen.getByText('Top posts')).toBeTruthy();
    expect(screen.getByText('120')).toBeTruthy();
    expect(screen.getByText('12')).toBeTruthy();
  });

  it('empty: renders honest zero states for a new account', async () => {
    mockState({
      insights: {
        reach: [],
        followerCount: [],
        viewsTotal: null,
        accountsEngagedTotal: null,
        windowDays: 28,
      },
      topMedia: [],
    });
    await render(<InsightsScreen />);

    expect(
      screen.getByText('No reach data yet — Meta can take up to 48h to report new insights.')
    ).toBeTruthy();
    expect(
      screen.getByText('Daily follower trends unlock at 100 followers — a Meta threshold.')
    ).toBeTruthy();
    expect(
      screen.getByText('No posts yet — share a post on Instagram and its performance lands here.')
    ).toBeTruthy();
  });

  it('session_expired: renders the reconnect card', async () => {
    mockState({ error: 'session_expired', insights: null });
    await render(<InsightsScreen />);

    expect(screen.getByText('Instagram disconnected')).toBeTruthy();
    expect(screen.getByText('Reconnect Instagram')).toBeTruthy();
  });

  it('insights_permission: explains the reconnect once to grant analytics', async () => {
    mockState({ error: 'insights_permission', insights: null });
    await render(<InsightsScreen />);

    expect(screen.getByText('Reconnect to unlock insights')).toBeTruthy();
    expect(screen.getByText('Reconnect Instagram')).toBeTruthy();
  });

  it('generic error: renders the inline retry strip above the dashboard', async () => {
    mockState({ error: 'Network request failed' });
    await render(<InsightsScreen />);

    expect(screen.getByText(/Couldn’t load insights/)).toBeTruthy();
    expect(screen.getByText('Retry')).toBeTruthy();
    // Dashboard still renders with degraded values
    expect(screen.getAllByText('Reach').length).toBeGreaterThan(0);
  });

  it('background refresh: keeps data visible with an Updating indicator', async () => {
    mockState({ isRefreshing: true });
    await render(<InsightsScreen />);

    expect(screen.getAllByText('270').length).toBeGreaterThan(0);
    expect(screen.getByText('Updating…')).toBeTruthy();
  });
});
