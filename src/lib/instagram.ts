/**
 * Instagram ig-api-proxy helper functions.
 *
 * Calls the Appwrite ig-api-proxy function for Instagram operations:
 * - fetchProfile(): GETs profile from /profile
 * - fetchMedia(): GETs media from /media?amount=25
 * - fetchInsights(): GETs insights from /insights
 * - disconnectInstagram(): POSTs disconnect to /disconnect
 *
 * All endpoints use Appwrite JWT auth via getAuthHeaders() (x-appwrite-user-jwt header).
 * The ig-api-proxy function returns { success: true, data: ... } — functions extract .data.
 */

import { account } from './appwrite';
import { executeWithRetry } from './resilient';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_PROXY_URL;

if (!API_BASE_URL) {
  throw new Error(
    'EXPO_PUBLIC_IG_API_PROXY_URL is not set. Add it to your .env file (e.g. https://ig-api-proxy.sgp.appwrite.run).'
  );
}

const FETCH_TIMEOUT_MS = 15_000;

/**
 * Returns auth headers with Appwrite JWT for ig-api-proxy endpoint calls.
 */
async function getAuthHeaders(): Promise<HeadersInit> {
  const jwtResponse = await account.createJWT();
  return {
    'x-appwrite-user-jwt': jwtResponse.jwt,
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
 * Instagram profile response from ig-api-proxy.
 */
export interface InstagramProfileResponse {
  id: string;
  username: string;
  name: string;
  biography: string;
  website?: string;
  followers_count: number;
  follows_count: number;
  media_count: number;
  profile_picture_url: string;
}

/**
 * Instagram media response from ig-api-proxy.
 */
export interface InstagramMediaResponse {
  id: string;
  caption: string | null;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM' | 'REELS';
  thumbnail_url: string | null;
  media_url: string | null;
  permalink: string | null;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

/**
 * Instagram insights response from ig-api-proxy.
 */
export interface InstagramInsightsResponse {
  data: Array<{
    name: string;
    period: string;
    values: Array<{ value: number; end_time: string }>;
    total_value?: { value: number };
    id?: string;
  }>;
  error?: string;
}

/**
 * Fetches the current user's Instagram profile from the ig-api-proxy function.
 * The JWT identifies the user.
 *
 * @throws Error("session_expired") on 401
 */
export async function _fetchProfile(): Promise<InstagramProfileResponse> {
  const headers = await getAuthHeaders();
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

  const body = await response.json();
  return body.data as InstagramProfileResponse;
}

/**
 * Public wrapper with retry on transient failures.
 * `withFreshSession` should be applied by the caller if session recovery is needed.
 */
export async function fetchProfile(): Promise<InstagramProfileResponse> {
  return executeWithRetry(() => _fetchProfile());
}

/**
 * Fetches the current user's Instagram media from the ig-api-proxy function.
 * Returns up to 25 media items.
 *
 * @throws Error("session_expired") on 401
 */
async function _fetchMedia(): Promise<InstagramMediaResponse[]> {
  const headers = await getAuthHeaders();
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

export async function fetchMedia(): Promise<InstagramMediaResponse[]> {
  return executeWithRetry(() => _fetchMedia());
}

/**
 * Fetches Instagram insights from the ig-api-proxy function.
 * Returns insights data or an error object — callers handle gracefully.
 *
 * @throws Error("session_expired") on 401
 * @throws Error on other non-200 responses
 */
async function _fetchInsights(): Promise<InstagramInsightsResponse> {
  const headers = await getAuthHeaders();
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

  const body = await response.json();
  return body.data as InstagramInsightsResponse;
}

export async function fetchInsights(): Promise<InstagramInsightsResponse> {
  return executeWithRetry(() => _fetchInsights());
}

/**
 * Disconnects Instagram session via the ig-api-proxy function.
 */
export async function disconnectInstagram(): Promise<void> {
  const headers = await getAuthHeaders();
  const response = await fetchWithTimeout(`${API_BASE_URL}/disconnect`, {
    method: 'POST',
    headers,
  });

  if (!response.ok) {
    throw new Error(`Disconnect failed: ${response.statusText}`);
  }
}
