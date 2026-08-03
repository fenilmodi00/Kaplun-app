/**
 * Instagram module tests — direct Graph API client.
 *
 * The module reads the user's long-lived token from the creators row and
 * calls graph.instagram.com directly (the ig-api-proxy function cannot
 * receive the x-appwrite-user-jwt header — Appwrite strips it).
 * All network calls are mocked via global fetch.
 */

const mockFetch = jest.fn();
global.fetch = mockFetch;

const mockAccountGet = jest.fn();
jest.mock('@/lib/appwrite', () => ({
  account: { get: (...args: unknown[]) => mockAccountGet(...args) },
}));

const mockGetCreatorByClerkId = jest.fn();
const mockUpdateCreatorToken = jest.fn();
const mockClearCreatorInstagramAuth = jest.fn();
jest.mock('@/lib/repository', () => ({
  getCreatorByClerkId: (...args: unknown[]) => mockGetCreatorByClerkId(...args),
  updateCreatorToken: (...args: unknown[]) => mockUpdateCreatorToken(...args),
  clearCreatorInstagramAuth: (...args: unknown[]) =>
    mockClearCreatorInstagramAuth(...args),
}));

import {
  fetchProfile,
  fetchMedia,
  fetchInsights,
  fetchAccountInsights,
  disconnectInstagram,
} from '@/lib/instagram';

const CREATOR_ROW = {
  $id: 'row-1',
  clerk_user_id: 'user_test',
  access_token: 'ig-token-123',
  token_expires_at: '2099-01-01T00:00:00.000Z',
};

beforeEach(() => {
  mockFetch.mockReset();
  mockAccountGet.mockReset().mockResolvedValue({ $id: 'user_test' });
  mockGetCreatorByClerkId.mockReset().mockResolvedValue(CREATOR_ROW);
  mockUpdateCreatorToken.mockReset().mockResolvedValue(undefined);
  mockClearCreatorInstagramAuth.mockReset().mockResolvedValue(undefined);
});

function graphOk(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body } as Response;
}

function graphError(code: number, message: string, status = 400) {
  return {
    ok: false,
    status,
    statusText: 'Bad Request',
    json: async () => ({ error: { code, message, type: 'OAuthException' } }),
  } as Response;
}

const mockProfile = {
  id: '12345',
  username: 'test_creator',
  name: 'Test Creator',
  biography: 'A test bio',
  followers_count: 1500,
  follows_count: 500,
  media_count: 42,
  profile_picture_url: 'https://example.com/pic.jpg',
};

const mockMedia = [
  {
    id: 'm1',
    caption: 'Great post',
    media_type: 'IMAGE',
    media_product_type: 'FEED',
    thumbnail_url: 'https://example.com/thumb.jpg',
    media_url: 'https://example.com/media.jpg',
    permalink: 'https://instagram.com/p/abc',
    timestamp: '2024-01-01T00:00:00Z',
    like_count: 100,
    comments_count: 10,
  },
  {
    id: 'm2',
    caption: 'A reel',
    media_type: 'VIDEO',
    media_product_type: 'REELS',
    thumbnail_url: 'https://example.com/thumb2.jpg',
    media_url: 'https://example.com/media2.mp4',
    permalink: 'https://instagram.com/reel/def',
    timestamp: '2024-01-02T00:00:00Z',
    like_count: 200,
    comments_count: 20,
  },
];

const mockInsights = {
  data: [
    { name: 'reach', period: 'day', values: [{ value: 5000, end_time: '2024-01-01T00:00:00+0000' }] },
    { name: 'follower_count', period: 'day', values: [{ value: 12, end_time: '2024-01-01T00:00:00+0000' }] },
  ],
};

describe('token resolution', () => {
  it('throws session_expired when no token is stored', async () => {
    mockGetCreatorByClerkId.mockResolvedValueOnce({ ...CREATOR_ROW, access_token: '' });

    await expect(fetchMedia()).rejects.toThrow('session_expired');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('resolves the token via the Appwrite user id', async () => {
    mockFetch.mockResolvedValueOnce(graphOk({ data: mockMedia }));

    await fetchMedia();

    expect(mockAccountGet).toHaveBeenCalledTimes(1);
    expect(mockGetCreatorByClerkId).toHaveBeenCalledWith('user_test');
  });
});

describe('fetchProfile', () => {
  it('happy: GETs /me with profile fields and returns the body', async () => {
    mockFetch.mockResolvedValueOnce(graphOk(mockProfile));

    const result = await fetchProfile();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('https://graph.instagram.com/');
    expect(url).toContain('/me?fields=');
    expect(url).toContain('followers_count');
    expect(url).toContain('access_token=ig-token-123');
    expect(result).toEqual(mockProfile);
  });
});

describe('fetchMedia', () => {
  it('happy: GETs /me/media with openreply fields and returns data array', async () => {
    mockFetch.mockResolvedValueOnce(graphOk({ data: mockMedia }));

    const result = await fetchMedia();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/me/media?fields=');
    expect(url).toContain('thumbnail_url');
    expect(url).toContain('media_product_type');
    expect(url).toContain('limit=25');
    expect(result).toEqual(mockMedia);
    expect(result).toHaveLength(2);
  });

  it('malformed_input: returns [] when data is missing', async () => {
    mockFetch.mockResolvedValueOnce(graphOk({}));

    const result = await fetchMedia();
    expect(result).toEqual([]);
  });

  it('non-190 graph error: throws the Meta message without refreshing', async () => {
    mockFetch.mockResolvedValueOnce(graphError(10, 'Permission denied'));

    await expect(fetchMedia()).rejects.toThrow('Permission denied');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateCreatorToken).not.toHaveBeenCalled();
  });
});

describe('token refresh on 190', () => {
  it('refreshes via ig_refresh_token, persists, and retries once', async () => {
    mockFetch
      .mockResolvedValueOnce(graphError(190, 'Session has expired'))
      .mockResolvedValueOnce(graphOk({ access_token: 'new-token-456', expires_in: 5184000 }))
      .mockResolvedValueOnce(graphOk({ data: mockMedia }));

    const result = await fetchMedia();

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [refreshUrl] = mockFetch.mock.calls[1];
    expect(refreshUrl).toContain('/refresh_access_token');
    expect(refreshUrl).toContain('grant_type=ig_refresh_token');
    expect(refreshUrl).toContain('access_token=ig-token-123');

    expect(mockUpdateCreatorToken).toHaveBeenCalledWith(
      'row-1',
      'new-token-456',
      expect.any(String),
    );

    const [retryUrl] = mockFetch.mock.calls[2];
    expect(retryUrl).toContain('access_token=new-token-456');
    expect(result).toEqual(mockMedia);
  });

  it('throws session_expired and clears the token when the refresh call fails with 190', async () => {
    mockFetch
      .mockResolvedValueOnce(graphError(190, 'Session has expired'))
      .mockResolvedValueOnce(graphError(190, 'Session has expired'));

    await expect(fetchMedia()).rejects.toThrow('session_expired');
    expect(mockClearCreatorInstagramAuth).toHaveBeenCalledWith('row-1');
  });

  it('throws session_expired when the retry after refresh is still 190', async () => {
    mockFetch
      .mockResolvedValueOnce(graphError(190, 'Session has expired'))
      .mockResolvedValueOnce(graphOk({ access_token: 'new-token-456' }))
      .mockResolvedValueOnce(graphError(190, 'Session has expired'));

    await expect(fetchMedia()).rejects.toThrow('session_expired');
  });
});

describe('fetchInsights', () => {
  it('happy: GETs /me/insights with metrics and returns body', async () => {
    mockFetch.mockResolvedValueOnce(graphOk(mockInsights));

    const result = await fetchInsights();

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain('/me/insights');
    expect(url).toContain('metric=reach,follower_count');
    expect(url).toContain('period=day');
    expect(result).toEqual(mockInsights);
  });
});

describe('fetchAccountInsights', () => {
  const mockSeries = {
    data: [
      {
        name: 'reach',
        period: 'day',
        values: [
          { value: 120, end_time: '2026-07-30T07:00:00+0000' },
          { value: 150, end_time: '2026-07-29T07:00:00+0000' },
        ],
      },
      {
        name: 'follower_count',
        period: 'day',
        values: [
          { value: 1490, end_time: '2026-07-29T07:00:00+0000' },
          { value: 1500, end_time: '2026-07-30T07:00:00+0000' },
        ],
      },
    ],
  };

  const mockTotals = {
    data: [
      { name: 'views', period: 'day', total_value: { value: 4200 } },
      { name: 'accounts_engaged', period: 'day', total_value: { value: 310 } },
    ],
  };

  it('happy: fetches series + totals and returns parsed window insights', async () => {
    mockFetch
      .mockResolvedValueOnce(graphOk(mockSeries))
      .mockResolvedValueOnce(graphOk(mockTotals));

    const result = await fetchAccountInsights(28);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [seriesUrl] = mockFetch.mock.calls[0];
    expect(seriesUrl).toContain('/me/insights');
    expect(seriesUrl).toContain('metric=reach,follower_count');
    expect(seriesUrl).toContain('period=day');
    expect(seriesUrl).toContain('since=');
    expect(seriesUrl).toContain('until=');

    const [totalsUrl] = mockFetch.mock.calls[1];
    expect(totalsUrl).toContain('metric=views,accounts_engaged');
    expect(totalsUrl).toContain('metric_type=total_value');

    // Series are normalized to oldest → newest regardless of Meta's order.
    expect(result.reach).toEqual([
      { value: 150, endTime: '2026-07-29T07:00:00+0000' },
      { value: 120, endTime: '2026-07-30T07:00:00+0000' },
    ]);
    expect(result.followerCount).toEqual([
      { value: 1490, endTime: '2026-07-29T07:00:00+0000' },
      { value: 1500, endTime: '2026-07-30T07:00:00+0000' },
    ]);
    expect(result.viewsTotal).toBe(4200);
    expect(result.accountsEngagedTotal).toBe(310);
    expect(result.windowDays).toBe(28);
  });

  it('falls back to views-only totals when the combined call is rejected', async () => {
    mockFetch
      .mockResolvedValueOnce(graphOk(mockSeries))
      .mockResolvedValueOnce(graphError(100, 'Invalid metric accounts_engaged'))
      .mockResolvedValueOnce(
        graphOk({ data: [{ name: 'views', period: 'day', total_value: { value: 900 } }] })
      );

    const result = await fetchAccountInsights(7);

    expect(mockFetch).toHaveBeenCalledTimes(3);
    const [fallbackUrl] = mockFetch.mock.calls[2];
    expect(fallbackUrl).toContain('metric=views');
    expect(fallbackUrl).not.toContain('accounts_engaged');
    expect(result.viewsTotal).toBe(900);
    expect(result.accountsEngagedTotal).toBeNull();
    expect(result.reach).toHaveLength(2);
  });

  it('degrades to null totals when every totals call fails', async () => {
    mockFetch
      .mockResolvedValueOnce(graphOk(mockSeries))
      .mockResolvedValueOnce(graphError(100, 'Invalid metric'))
      .mockResolvedValueOnce(graphError(100, 'Invalid metric'));

    const result = await fetchAccountInsights(28);

    expect(result.viewsTotal).toBeNull();
    expect(result.accountsEngagedTotal).toBeNull();
    expect(result.reach).toHaveLength(2);
  });

  it('maps Meta permission errors to insights_permission', async () => {
    mockFetch
      .mockResolvedValueOnce(
        graphError(10, '(#10) Application does not have permission for this action')
      )
      .mockResolvedValueOnce(graphOk(mockTotals));

    await expect(fetchAccountInsights(28)).rejects.toThrow('insights_permission');
  });

  it('returns empty series when Meta reports no data', async () => {
    mockFetch
      .mockResolvedValueOnce(graphOk({ data: [] }))
      .mockResolvedValueOnce(graphOk(mockTotals));

    const result = await fetchAccountInsights(28);

    expect(result.reach).toEqual([]);
    expect(result.followerCount).toEqual([]);
    expect(result.viewsTotal).toBe(4200);
  });
});

describe('disconnectInstagram', () => {
  it('fully clears Instagram auth on the creators row', async () => {
    await disconnectInstagram();

    expect(mockClearCreatorInstagramAuth).toHaveBeenCalledWith('row-1');
    expect(mockUpdateCreatorToken).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('no-op when there is no creator row', async () => {
    mockGetCreatorByClerkId.mockResolvedValueOnce(null);

    await expect(disconnectInstagram()).resolves.toBeUndefined();
    expect(mockClearCreatorInstagramAuth).not.toHaveBeenCalled();
  });
});
