/**
 * Instagram module tests — FastAPI backend migration.
 *
 * These tests replace the old OAuth-based tests with FastAPI endpoint calls.
 * All network calls are mocked via global fetch.
 */

// Must mock before importing the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@/lib/appwrite', () => ({
  account: { createJWT: jest.fn().mockResolvedValue({ jwt: 'test-jwt' }) },
}));

process.env.EXPO_PUBLIC_IG_API_PROXY_URL = 'https://test-proxy.example.com';

import {
  fetchProfile,
  fetchMedia,
  fetchInsights,
  disconnectInstagram,
} from '@/lib/instagram';

beforeEach(() => {
  mockFetch.mockReset();
});

const mockProfile = {
  id: '12345',
  username: 'test_creator',
  name: 'Test Creator',
  biography: 'A test bio',
  website: null,
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
    thumbnail_url: 'https://example.com/thumb.jpg',
    media_url: 'https://example.com/media.mp4',
    permalink: 'https://instagram.com/p/abc',
    timestamp: '2024-01-01T00:00:00Z',
    like_count: 100,
    comments_count: 10,
  },
  {
    id: 'm2',
    caption: 'Another post',
    media_type: 'CAROUSEL_ALBUM',
    thumbnail_url: 'https://example.com/thumb2.jpg',
    media_url: 'https://example.com/media2.jpg',
    permalink: 'https://instagram.com/p/def',
    timestamp: '2024-01-01T00:00:00Z',
    like_count: 200,
    comments_count: 20,
  },
];

const mockInsights = {
  data: [
    { name: 'reach', period: 'day', values: [{ value: 5000, end_time: '2024-01-01T00:00:00+0000' }] },
    { name: 'views', period: 'day', total_value: { value: 12000 } },
  ],
};

describe('fetchProfile', () => {
  it('happy: returns profile on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockProfile }),
    } as Response);

    const result = await fetchProfile();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/profile');
    expect(options.method).toBe('GET');
    expect(options.headers['x-appwrite-user-jwt']).toBeDefined();

    expect(result).toEqual(mockProfile);
  });

  it('session expired: throws session_expired on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchProfile()).rejects.toThrow('session_expired');
  });

  it('malformed_input: handles fetch throwing a network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    await expect(fetchProfile()).rejects.toThrow();
  });
});

describe('fetchMedia', () => {
  it('happy: returns media array on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockMedia }),
    } as Response);

    const result = await fetchMedia();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/media');
    expect(url).toContain('amount=25');
    expect(options.method).toBe('GET');
    expect(options.headers['x-appwrite-user-jwt']).toBeDefined();

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

    await expect(fetchMedia()).rejects.toThrow('session_expired');
  });

  it('non-ok: throws on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(fetchMedia()).rejects.toThrow();
  });

  it('malformed_input: handles empty data array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: [] }),
    } as Response);

    const result = await fetchMedia();
    expect(result).toEqual([]);
  });
});

describe('fetchInsights', () => {
  it('happy: returns insights on 200', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: mockInsights }),
    } as Response);

    const result = await fetchInsights();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/insights');
    expect(options.method).toBe('GET');
    expect(options.headers['x-appwrite-user-jwt']).toBeDefined();

    expect(result).toEqual(mockInsights);
  });

  it('non-business: returns error object as-is (no throw on 200)', async () => {
    const businessError = { error: 'Business account required for insights' };
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ success: true, data: businessError }),
    } as Response);

    const result = await fetchInsights();

    expect(result).toEqual(businessError);
  });

  it('session expired: throws session_expired on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({}),
    } as Response);

    await expect(fetchInsights()).rejects.toThrow('session_expired');
  });

  it('non-ok: throws on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(fetchInsights()).rejects.toThrow();
  });
});

describe('disconnectInstagram', () => {
  it('happy: calls POST /disconnect', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);

    await disconnectInstagram();

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain('/disconnect');
    expect(options.method).toBe('POST');
    expect(options.headers['x-appwrite-user-jwt']).toBeDefined();
  });

  it('malformed_input: throws on non-ok disconnect response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({}),
    } as Response);

    await expect(disconnectInstagram()).rejects.toThrow();
  });
});

// getAuthHeaders is now a private synchronous function — tested implicitly via all above calls
