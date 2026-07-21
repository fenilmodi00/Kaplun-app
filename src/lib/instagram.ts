/**
 * Instagram FastAPI helper functions.
 *
 * Replaced Graph API OAuth flow with FastAPI backend calls:
 * - loginInstagram(): POSTs credentials to FastAPI /login
 * - fetchProfile(): GETs profile from FastAPI /profile
 * - fetchMedia(): GETs media from FastAPI /media?amount=25
 * - fetchInsights(): GETs insights from FastAPI /insights
 * - disconnectInstagram(): POSTs disconnect to FastAPI /disconnect
 *
 * All endpoints use JWT auth via getAuthHeaders() (Authorization: Bearer header).
 */

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file (e.g. http://localhost:8000 or ngrok URL).'
  );
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Returns auth headers with Clerk JWT Bearer token for FastAPI endpoint calls.
 */
function getAuthHeaders(clerkToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${clerkToken}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Wraps fetch with an AbortController timeout.
 * Aborts after FETCH_TIMEOUT_MS if no response.
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Instagram profile response matching instagrapi user_info output.
 */
export interface InstagramProfileResponse {
  pk: string;
  username: string;
  full_name: string;
  biography: string;
  external_url: string | null;
  follower_count: number;
  following_count: number;
  media_count: number;
  is_private: boolean;
  is_verified: boolean;
  profile_pic_url: string;
  is_business: boolean;
}

/**
 * Instagram media response matching instagrapi user_medias output.
 */
export interface InstagramMediaResponse {
  pk: string;
  caption_text: string | null;
  media_type: number;
  thumbnail_url: string | null;
  media_url: string | null;
  permalink: string;
  taken_at: number;
  like_count: number;
  comment_count: number;
  view_count: number;
  play_count: number;
}

/**
 * Instagram insights response.
 */
export interface InstagramInsightsResponse {
  data: Array<{
    name: string;
    period: string;
    values: Array<{ value: number; end_time: string }>;
  }>;
  error?: string;
}

/**
 * Logs in to Instagram via the FastAPI backend.
 * Sends credentials to /login — credentials are NOT stored client-side.
 *
 * @throws Error("Invalid credentials") on 401
 * @throws Error("Instagram login failed") on 502 or other non-200
 */
export async function loginInstagram(
  clerkToken: string,
  clerkId: string,
  username: string,
  password: string
): Promise<InstagramProfileResponse> {
  const headers = getAuthHeaders(clerkToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/login`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      clerk_id: clerkId,
      username,
      password,
    }),
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('Invalid credentials');
    }
    throw new Error('Instagram login failed');
  }

  return response.json();
}

/**
 * Fetches the current user's Instagram profile from the FastAPI backend.
 * No params — the JWT identifies the user.
 *
 * @throws Error("session_expired") on 401
 */
export async function fetchProfile(clerkToken: string): Promise<InstagramProfileResponse> {
  const headers = getAuthHeaders(clerkToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/profile`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('session_expired');
    }
    throw new Error(`Fetch profile failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetches the current user's Instagram media from the FastAPI backend.
 * Returns up to 25 media items.
 *
 * @throws Error("session_expired") on 401
 */
export async function fetchMedia(clerkToken: string): Promise<InstagramMediaResponse[]> {
  const headers = getAuthHeaders(clerkToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/media?amount=25`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('session_expired');
    }
    throw new Error(`Fetch media failed: ${response.statusText}`);
  }

  const body = await response.json();
  return body.data ?? [];
}

/**
 * Fetches Instagram insights from the FastAPI backend.
 * Returns insights data or an error object — callers handle gracefully.
 *
 * @throws Error("session_expired") on 401
 * @throws Error on other non-200 responses
 */
export async function fetchInsights(clerkToken: string): Promise<InstagramInsightsResponse> {
  const headers = getAuthHeaders(clerkToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/insights`, {
    method: 'GET',
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error('session_expired');
    }
    throw new Error(`Fetch insights failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Disconnects Instagram session via the FastAPI backend.
 */
export async function disconnectInstagram(clerkToken: string): Promise<void> {
  const headers = getAuthHeaders(clerkToken);
  const response = await fetchWithTimeout(`${API_BASE_URL}/disconnect`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Disconnect failed: ${response.statusText}`);
  }
}
