/**
 * Instagram module tests — FastAPI backend migration.
 *
 * These tests replace the old OAuth-based tests with FastAPI endpoint calls.
 * All network calls are mocked via global fetch.
 */

// Must mock before importing the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

import {
  loginInstagram,
  fetchProfile,
  fetchMedia,
  fetchInsights,
  disconnectInstagram,
} from '@/lib/instagram';

const TEST_TOKEN = 'test-clerk-jwt';

beforeEach(() => {
  mockFetch.mockReset();
});

const mockProfile = {
  pk: '12345',
  username: 'test_creator',
  full_name: 'Test Creator',
  biography: 'A test bio',
  external_url: null,
  follower_count: 1500,
  following_count: 500,
  media_count: 42,
  is_private: false,
  is_verified: true,
  profile_pic_url: 'https://example.com/pic.jpg',
  is_business: true,
};

const mockMedia = [
  {
    pk: 'm1',
    caption_text: 'Great post',
    media_type: 1,
    thumbnail_url: 'https://example.com/thumb.jpg',
    media_url: 'https://example.com/media.mp4',
    permalink: 'https://instagram.com/p/abc',
    taken_at: 1700000000,
    like_count: 100,
    comment_count: 10,
    view_count: 5000,
    play_count: 4800,
  },
  {
    pk: 'm2',
    caption_text: 'Another post',
    media_type: 2,
    thumbnail_url: 'https://example.com/thumb2.jpg',
    media_url: 'https://example.com/media2.jpg',
    permalink: 'https://instagram.com/p/def',
    taken_at: 1699900000,
    like_count: 200,
    comment_count: 20,
    view_count: 0,
    play_count: 0,
  },
];

const mockInsights = {
  data: [
    {
      name: 'impressions',
      period: 'days_28',
      values: [{ value: 10000, end_time: '2024-01-01T00:00:00Z' }],
    },
  ],
};

describe('loginInstagram', () => {
  const clerkId = 'clerk_123';
  const username = 'myuser';
  const password = 'mypass';

  it('happy: returns profile on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockProfile,
    } as Response);

    const result = await loginInstagram(TEST_TOKEN, clerkId, username, password);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/login');
    expect(options.method).toBe('POST');
    expect(options.headers).toBeDefined();
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);
    expect(options.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(options.body);
    expect(body).toEqual({
      clerk_id: clerkId,
      username,
      password,
    });

    expect(result).toEqual(mockProfile);
  });

  it('failure: throws Invalid credentials on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(loginInstagram(TEST_TOKEN, clerkId, username, password)).rejects.toThrow(
      'Invalid credentials'
    );
  });

  it('failure: throws Instagram login failed on 502', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({}),
    } as Response);

    await expect(loginInstagram(TEST_TOKEN, clerkId, username, password)).rejects.toThrow(
      'Instagram login failed'
    );
  });

  it('failure: throws generic error on other non-ok status', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(loginInstagram(TEST_TOKEN, clerkId, username, password)).rejects.toThrow(
      'Instagram login failed'
    );
  });

  it('malformed_input: handles non-JSON response gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('Unexpected token');
      },
    } as unknown as Response);

    await expect(loginInstagram(TEST_TOKEN, clerkId, username, password)).rejects.toThrow();
  });
});

describe('fetchProfile', () => {
  it('happy: returns profile on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockProfile,
    } as Response);

    const result = await fetchProfile(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/profile');
    expect(options.method).toBe('GET');
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);

    expect(result).toEqual(mockProfile);
  });

  it('session expired: throws session_expired on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchProfile(TEST_TOKEN)).rejects.toThrow('session_expired');
  });

  it('malformed_input: handles fetch throwing a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchProfile(TEST_TOKEN)).rejects.toThrow();
  });
});

describe('fetchMedia', () => {
  it('happy: returns media array on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: mockMedia }),
    } as Response);

    const result = await fetchMedia(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/media');
    expect(url).toContain('amount=25');
    expect(options.method).toBe('GET');
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);

    expect(result).toEqual(mockMedia);
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });

  it('session expired: throws session_expired on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchMedia(TEST_TOKEN)).rejects.toThrow('session_expired');
  });

  it('non-ok: throws on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(fetchMedia(TEST_TOKEN)).rejects.toThrow();
  });

  it('malformed_input: handles empty data array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: [] }),
    } as Response);

    const result = await fetchMedia(TEST_TOKEN);
    expect(result).toEqual([]);
  });
});

describe('fetchInsights', () => {
  it('happy: returns insights on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockInsights,
    } as Response);

    const result = await fetchInsights(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/insights');
    expect(options.method).toBe('GET');
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);

    expect(result).toEqual(mockInsights);
  });

  it('non-business: returns error object as-is (no throw on 200)', async () => {
    const businessError = { error: 'Business account required for insights' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => businessError,
    } as Response);

    const result = await fetchInsights(TEST_TOKEN);

    expect(result).toEqual(businessError);
  });

  it('session expired: throws session_expired on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchInsights(TEST_TOKEN)).rejects.toThrow('session_expired');
  });

  it('non-ok: throws on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(fetchInsights(TEST_TOKEN)).rejects.toThrow();
  });
});

describe('disconnectInstagram', () => {
  it('happy: calls POST /disconnect', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await disconnectInstagram(TEST_TOKEN);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/disconnect');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe(`Bearer ${TEST_TOKEN}`);
  });

  it('malformed_input: throws on non-ok disconnect response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(disconnectInstagram(TEST_TOKEN)).rejects.toThrow();
  });
});

// getAuthHeaders is now a private synchronous function — tested implicitly via all above calls
