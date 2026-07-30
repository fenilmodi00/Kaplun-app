/**
 * Automations FastAPI client tests.
 *
 * Tests the Clerk-Bearer-authenticated automations client.
 * All network calls are mocked via global fetch.
 */

// Must mock before importing the module
const mockFetch = jest.fn();
global.fetch = mockFetch;

// EXPO_PUBLIC_IG_API_BASE_URL is set in jest.setup.ts to http://localhost:8000

import {
  createAutomation,
  getAutomationStats,
  getOverviewStats,
  listAutomations,
  updateAutomation,
  deleteAutomation,
  listAutomationLogs,
  listCampaignTemplates,
  type CreateAutomationInput,
} from '@/lib/automations';

const mockGetToken = jest.fn<Promise<string | null>, []>();

beforeEach(() => {
  mockFetch.mockReset();
  mockGetToken.mockReset();
  mockGetToken.mockResolvedValue('mock-clerk-token');
});

const mockAutomation = {
  $id: 'auto_1',
  clerk_user_id: 'clerk_user_1',
  ig_user_id: 'ig_user_1',
  name: 'Test Automation',
  target_type: 'all_posts' as const,
  media_ids: [],
  bound_media_ids: [],
  keywords: ['hello', 'world'],
  match_mode: 'whole_word' as const,
  opening_dm_mode: 'direct' as const,
  dm_message: 'Thanks for your comment!',
  button_text: null,
  reveal_message: null,
  track_links: false,
  public_reply_enabled: false,
  public_reply_message: null,
  status: 'active' as const,
  created_at: '2026-07-29T00:00:00Z',
  updated_at: '2026-07-29T00:00:00Z',
};

const mockLog = {
  $id: 'log_1',
  automation_id: 'auto_1',
  comment_id: 'comment_1',
  commenter_username: 'test_user',
  comment_text: 'hello world',
  matched_keyword: 'hello',
  action: 'dm_sent' as const,
  reason: null,
  created_at: '2026-07-29T00:00:00Z',
};

const createInput: CreateAutomationInput = {
  name: 'Test Automation',
  target_type: 'all_posts',
  keywords: ['hello', 'world'],
  match_mode: 'whole_word',
  dm_message: 'Thanks for your comment!',
  public_reply_enabled: false,
};

describe('createAutomation', () => {
  it('happy: POSTs to /automations with Bearer token and returns automation', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ automation: mockAutomation }),
    } as Response);

    const result = await createAutomation(mockGetToken, createInput);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations');
    expect(options.method).toBe('POST');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(options.body)).toEqual(createInput);
    expect(result).toEqual(mockAutomation);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(createAutomation(mockGetToken, createInput)).rejects.toThrow('session_expired');
  });

  it('session_expired: throws when getToken returns null', async () => {
    mockGetToken.mockResolvedValueOnce(null);

    await expect(createAutomation(mockGetToken, createInput)).rejects.toThrow('session_expired');
  });

  it('non-ok: throws descriptive error on 422', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: async () => '{"detail":[{"loc":["body","keywords"],"msg":"field required"}]}',
    } as Response);

    await expect(createAutomation(mockGetToken, createInput)).rejects.toThrow(
      'automations request failed (422):',
    );
  });
});

describe('listAutomations', () => {
  it('happy: GETs /automations and returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ automations: [mockAutomation] }),
    } as Response);

    const result = await listAutomations(mockGetToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual([mockAutomation]);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(listAutomations(mockGetToken)).rejects.toThrow('session_expired');
  });

  it('empty: returns empty array when no automations', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ automations: [] }),
    } as Response);

    const result = await listAutomations(mockGetToken);
    expect(result).toEqual([]);
  });
});

describe('updateAutomation', () => {
  it('happy: PATCHes to /automations/:id with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ automation: { ...mockAutomation, name: 'Updated' } }),
    } as Response);

    const result = await updateAutomation(mockGetToken, 'auto_1', { name: 'Updated' });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/auto_1');
    expect(options.method).toBe('PATCH');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result.name).toBe('Updated');
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(updateAutomation(mockGetToken, 'auto_1', { name: 'x' })).rejects.toThrow('session_expired');
  });
});

describe('deleteAutomation', () => {
  it('happy: DELETEs to /automations/:id with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => undefined,
    } as Response);

    await deleteAutomation(mockGetToken, 'auto_1');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/auto_1');
    expect(options.method).toBe('DELETE');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(deleteAutomation(mockGetToken, 'auto_1')).rejects.toThrow('session_expired');
  });
});

describe('listAutomationLogs', () => {
  it('happy: GETs /automations/:id/logs and returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ logs: [mockLog] }),
    } as Response);

    const result = await listAutomationLogs(mockGetToken, 'auto_1');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/auto_1/logs');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual([mockLog]);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(listAutomationLogs(mockGetToken, 'auto_1')).rejects.toThrow('session_expired');
  });
});

describe('listCampaignTemplates', () => {
  const mockTemplates = [
    { slug: 'dtc-product-link', title: 'DTC Product Link Drop', keywords: ['LINK', 'SHOP', 'BUY'], dm_message: 'Hey {username}, here is the link' },
    { slug: 'creator-media-kit', title: 'Creator Media Kit Reply', keywords: ['COLLAB', 'KIT', 'RATES'], dm_message: 'Hey {username}, here is my media kit' },
  ];

  it('happy: GETs /automations/templates and returns array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ templates: mockTemplates }),
    } as Response);

    const result = await listCampaignTemplates(mockGetToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/templates');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual(mockTemplates);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(listCampaignTemplates(mockGetToken)).rejects.toThrow('session_expired');
  });

  it('empty: returns empty array when no templates', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ templates: [] }),
    } as Response);

    const result = await listCampaignTemplates(mockGetToken);
    expect(result).toEqual([]);
  });
});

describe('getAutomationStats', () => {
  const mockStats = {
    sent: 41,
    skipped: 3,
    failed: 1,
    clicks: 12,
    ctr: 0.29,
    top_keywords: [['LINK', 30], ['SHOP', 11]] as [string, number][],
    daily: [
      { date: '2026-07-23', sent: 5 },
      { date: '2026-07-24', sent: 8 },
    ],
  };

  it('happy: GETs /automations/:id/stats and returns stats', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockStats,
    } as Response);

    const result = await getAutomationStats(mockGetToken, 'auto_1');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/auto_1/stats');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual(mockStats);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(getAutomationStats(mockGetToken, 'auto_1')).rejects.toThrow('session_expired');
  });
});

describe('getOverviewStats', () => {
  const mockOverview = {
    sent_7d: 128,
    clicks_7d: 31,
    ctr_7d: 0.24,
    top_keyword_7d: 'LINK',
    active_automations: 3,
  };

  it('happy: GETs /automations/stats/overview and returns overview', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockOverview,
    } as Response);

    const result = await getOverviewStats(mockGetToken);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8000/automations/stats/overview');
    expect(options.method).toBe('GET');
    expect(options.headers).toEqual({
      Authorization: 'Bearer mock-clerk-token',
      'Content-Type': 'application/json',
    });
    expect(result).toEqual(mockOverview);
  });

  it('session_expired: throws on 401', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as Response);

    await expect(getOverviewStats(mockGetToken)).rejects.toThrow('session_expired');
  });
});
