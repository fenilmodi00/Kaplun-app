/**
 * Unified Gin/Go API client tests.
 *
 * All network calls are mocked via global fetch.
 */

// Must mock before importing the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

jest.mock('@/lib/auth-session', () => ({
  getAppwriteJWT: jest.fn().mockResolvedValue('mock-appwrite-jwt'),
}));

// EXPO_PUBLIC_IG_API_BASE_URL is set in jest.setup.ts to http://localhost:8000

import { get, post } from '@/lib/api-go-client';

beforeEach(() => {
  mockFetch.mockReset();
});

const okResponse = (body: unknown, status = 200) =>
  ({ ok: true, status, json: async () => body } as Response);

describe('get', () => {
  it('happy: GETs path with Bearer token and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ hello: 'world' }));

    const result = await get<{ hello: string }>('/health');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/health');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-appwrite-jwt',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual({ hello: 'world' });
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(get('/health')).rejects.toThrow('session_expired');
  });

  it('not_found: throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);

    await expect(get('/missing')).rejects.toThrow('not_found');
  });

  it('non-ok: throws descriptive error with body snippet on 500', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => '{"error":"boom"}',
    } as Response);

    await expect(get('/health')).rejects.toThrow('request failed (500): {"error":"boom"}');
  });

  it('timeout: aborts via AbortController and does not retry', async () => {
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    });

    await expect(get('/slow', { timeoutMs: 50 })).rejects.toThrow('Aborted');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('retry: retries transient network errors by default', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(okResponse({ ok: true }));

    const result = await get<{ ok: boolean }>('/health');

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });

  it('noRetry: true skips retry on GET', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(get('/health', { noRetry: true })).rejects.toThrow('Network request failed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});

describe('post', () => {
  it('happy: POSTs JSON body with Bearer token and returns parsed JSON', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({ id: 'x' }, 201));

    const result = await post<{ id: string }>('/things', { name: 'n' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/things');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-appwrite-jwt',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual({ name: 'n' });
    expect(result).toEqual({ id: 'x' });
  });

  it('happy: sends no body when undefined', async () => {
    mockFetch.mockResolvedValueOnce(okResponse({}));

    await post('/things');

    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toBeUndefined();
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(post('/things')).rejects.toThrow('session_expired');
  });

  it('not_found: throws on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    } as Response);

    await expect(post('/things')).rejects.toThrow('not_found');
  });

  it('no retry: does not retry transient errors by default', async () => {
    mockFetch.mockRejectedValue(new TypeError('Network request failed'));

    await expect(post('/things')).rejects.toThrow('Network request failed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('noRetry: false forces retry on POST', async () => {
    mockFetch
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(okResponse({ ok: true }));

    const result = await post<{ ok: boolean }>('/things', undefined, { noRetry: false });

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ ok: true });
  });
});
