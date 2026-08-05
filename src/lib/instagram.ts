/**
 * Instagram Graph API client — direct calls with the per-user OAuth token.
 *
 * Why not the ig-api-proxy Appwrite function? The proxy reads the caller's
 * Appwrite JWT from the `x-appwrite-user-jwt` header, but Appwrite's gateway
 * strips reserved `x-appwrite-*` headers before the request reaches the
 * function runtime — every proxy call fails with 401 "Missing JWT token"
 * (verified in function execution logs: the JWT header never arrives).
 * The proxy cannot authenticate anyone, so it cannot be used.
 *
 * Instead, the app reads the user's own Instagram long-lived token from
 * their creators row (row-level permissions restrict it to the owner) and
 * calls the Instagram Graph API directly — the same `graph.instagram.com`
 * endpoints the proxy used (see openreply / Meta docs).
 *
 * Token lifecycle:
 * - Long-lived tokens last 60 days (`token_expires_at` on the row).
 * - On Graph error 190 (invalid/expired token) we attempt ONE token refresh
 *   via `ig_refresh_token` and persist the new token back to the row.
 * - If refresh fails, we throw `session_expired` — the app-wide convention
 *   that surfaces the "reconnect Instagram" flow.
 */

import { account } from './appwrite';
import { executeWithRetry } from './resilient';
import {
  clearCreatorInstagramAuth,
  getCreatorByClerkId,
  updateCreatorToken,
} from './repository';
import { addLog } from './logger';

// Pinned v26.0 (latest Graph API, released 2026-07-29). Instagram-Login account
// insights require v22.0+ (satisfied). Bump deliberately as older versions
// approach EOL (v22.0 EOL 2027-05-20).
const GRAPH_API_BASE = 'https://graph.instagram.com/v26.0';
const FETCH_TIMEOUT_MS = 15_000;

/** Media fields per Meta docs / openreply — thumbnail_url covers VIDEO+REELS. */
const MEDIA_FIELDS =
  'id,caption,media_type,media_product_type,media_url,thumbnail_url,timestamp,permalink,like_count,comments_count';
const PROFILE_FIELDS =
  'id,username,name,biography,website,followers_count,follows_count,media_count,profile_picture_url';
const INSIGHTS_METRICS = 'reach,follower_count';
const DEFAULT_LONG_LIVED_EXPIRES_IN = 5_184_000; // 60 days, per Meta docs

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
 * Instagram profile response from the Graph API (`GET /me`).
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
 * Instagram media item from the Graph API (`GET /me/media`).
 * For IMAGE use `media_url`; for VIDEO/REELS use `thumbnail_url`.
 * `media_product_type` distinguishes REELS from FEED/STORY.
 */
export interface InstagramMediaResponse {
  id: string;
  caption: string | null;
  media_type: 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  media_product_type?: 'FEED' | 'REELS' | 'STORY';
  thumbnail_url: string | null;
  media_url: string | null;
  permalink: string | null;
  timestamp: string;
  like_count: number;
  comments_count: number;
}

/**
 * Instagram insights response from the Graph API (`GET /me/insights`).
 * Time-series metrics return `values`; `metric_type=total_value` metrics
 * (e.g. `views`) return `total_value` instead.
 */
export interface InstagramInsightsResponse {
  data: Array<{
    name: string;
    period: string;
    values?: Array<{ value: number; end_time: string }>;
    total_value?: { value: number };
    id?: string;
  }>;
  error?: string;
}

/** A single day of a time-series insight metric. */
export interface InsightPoint {
  value: number;
  endTime: string;
}

/**
 * Parsed account insights over a rolling window. `reach` and `followerCount`
 * are daily series (oldest → newest); `viewsTotal` / `accountsEngagedTotal`
 * are window totals, `null` when Meta has no data for the metric.
 * `followerCount` is empty for accounts under 100 followers (Meta limitation).
 */
export interface InstagramAccountInsights {
  reach: InsightPoint[];
  followerCount: InsightPoint[];
  viewsTotal: number | null;
  accountsEngagedTotal: number | null;
  windowDays: number;
}

/** Thrown when Meta returns error code 190 (invalid/expired access token). */
class GraphTokenExpired extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphTokenExpired';
  }
}

interface GraphErrorShape {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

/**
 * GET a Graph API path with the given access token.
 * Maps Meta error bodies to typed throws (190 → GraphTokenExpired).
 */
async function graphGet<T>(path: string, accessToken: string): Promise<T> {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${GRAPH_API_BASE}${path}${separator}access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetchWithTimeout(url, { method: 'GET' });
  const body = (await response.json().catch(() => ({}))) as T & GraphErrorShape;

  const graphError = (body as GraphErrorShape).error;
  if (graphError) {
    if (graphError.code === 190) {
      throw new GraphTokenExpired(graphError.message ?? 'Instagram token expired');
    }
    throw new Error(
      graphError.message ?? `Instagram Graph error (code ${graphError.code ?? response.status})`
    );
  }
  if (!response.ok) {
    throw new Error(`Instagram Graph request failed: ${response.status} ${response.statusText}`);
  }
  return body as T;
}

interface ResolvedToken {
  token: string;
  rowId: string;
}

/**
 * Resolve the current user's Instagram token from their creators row.
 * The Appwrite user $id equals the Clerk user id (the auth bridge creates
 * Appwrite users that way), and row permissions restrict reads to the owner.
 *
 * @throws Error("session_expired") if no token is stored (not connected).
 */
async function resolveCreatorToken(): Promise<ResolvedToken> {
  const user = await account.get();
  const creator = await getCreatorByClerkId(user.$id);
  if (!creator || !creator.$id || !creator.access_token) {
    throw new Error('session_expired');
  }
  return { token: creator.access_token, rowId: creator.$id };
}

/**
 * Refresh a long-lived token via `ig_refresh_token` (no app secret needed).
 * Returns the new token + its computed expiry timestamp.
 *
 * Re-throws `GraphTokenExpired` when Meta explicitly rejects the token (code 190)
 * so the caller can clear the stale row. All other failures surface as
 * `session_expired`.
 */
async function refreshLongLivedToken(
  currentToken: string
): Promise<{ token: string; expiresAt: string }> {
  try {
    const body = await graphGet<{ access_token?: string; expires_in?: number }>(
      '/refresh_access_token?grant_type=ig_refresh_token',
      currentToken
    );
    if (!body.access_token) {
      throw new Error('session_expired');
    }
    const expiresAt = new Date(
      Date.now() + (body.expires_in ?? DEFAULT_LONG_LIVED_EXPIRES_IN) * 1000
    ).toISOString();
    return { token: body.access_token, expiresAt };
  } catch (err) {
    if (err instanceof GraphTokenExpired) {
      throw err;
    }
    throw new Error('session_expired');
  }
}

/**
 * Execute a Graph API call with the stored token. On a 190 rejection,
 * refresh the token once, persist it, and retry the call once.
 *
 * @throws Error("session_expired") if refresh or the retry also fails.
 */
async function callWithFreshToken<T>(
  call: (token: string) => Promise<T>
): Promise<T> {
  const { token, rowId } = await resolveCreatorToken();

  try {
    return await call(token);
  } catch (err) {
    if (!(err instanceof GraphTokenExpired)) throw err;

    addLog('instagram: token rejected (190) — attempting ig_refresh_token');
    let refreshed: { token: string; expiresAt: string };
    try {
      refreshed = await refreshLongLivedToken(token);
    } catch (refreshErr: unknown) {
      addLog(
        `instagram: token refresh failed — ${
          refreshErr instanceof Error ? refreshErr.message : String(refreshErr)
        }`
      );
      // Meta explicitly rejected the refresh (code 190) — the stored token is
      // unusable. Clear it so every screen (including home) agrees the account
      // is disconnected.
      if (refreshErr instanceof GraphTokenExpired) {
        try {
          await disconnectInstagram();
        } catch (clearErr: unknown) {
          addLog(
            `instagram: failed to clear invalidated token — ${
              clearErr instanceof Error ? clearErr.message : String(clearErr)
            }`
          );
        }
      }
      throw new Error('session_expired');
    }

    try {
      await updateCreatorToken(rowId, refreshed.token, refreshed.expiresAt);
    } catch (persistErr: unknown) {
      // Best-effort — the in-memory token still works for this call.
      addLog(
        `instagram: failed to persist refreshed token — ${
          persistErr instanceof Error ? persistErr.message : String(persistErr)
        }`
      );
    }

    try {
      return await call(refreshed.token);
    } catch (retryErr) {
      if (retryErr instanceof GraphTokenExpired) {
        // A fresh token was rejected immediately — clear the row.
        try {
          await disconnectInstagram();
        } catch (clearErr: unknown) {
          addLog(
            `instagram: failed to clear rejected token — ${
              clearErr instanceof Error ? clearErr.message : String(clearErr)
            }`
          );
        }
        throw new Error('session_expired');
      }
      throw retryErr;
    }
  }
}

/**
 * Fetches the current user's Instagram profile (`GET /me`).
 *
 * @throws Error("session_expired") when the stored token is unusable.
 */
export async function fetchProfile(): Promise<InstagramProfileResponse> {
  return executeWithRetry(() =>
    callWithFreshToken((token) =>
      graphGet<InstagramProfileResponse>(`/me?fields=${PROFILE_FIELDS}`, token)
    )
  );
}

/**
 * Fetches the current user's Instagram media (`GET /me/media`).
 * Returns up to 25 items, newest first.
 *
 * @throws Error("session_expired") when the stored token is unusable.
 */
export async function fetchMedia(): Promise<InstagramMediaResponse[]> {
  return executeWithRetry(() =>
    callWithFreshToken(async (token) => {
      const body = await graphGet<{ data?: InstagramMediaResponse[] }>(
        `/me/media?fields=${MEDIA_FIELDS}&limit=25`,
        token
      );
      return body.data ?? [];
    })
  );
}

/**
 * Fetches account insights (`GET /me/insights`).
 * Requires a professional (business/creator) account.
 *
 * @throws Error("session_expired") when the stored token is unusable.
 */
export async function fetchInsights(): Promise<InstagramInsightsResponse> {
  return executeWithRetry(() =>
    callWithFreshToken((token) =>
      graphGet<InstagramInsightsResponse>(
        `/me/insights?metric=${INSIGHTS_METRICS}&period=day`,
        token
      )
    )
  );
}

const SERIES_INSIGHTS_METRICS = 'reach,follower_count';
const TOTAL_INSIGHTS_METRICS = 'views,accounts_engaged';

function seriesPoints(
  body: InstagramInsightsResponse,
  metric: string
): InsightPoint[] {
  const entry = body.data?.find((d) => d.name === metric);
  return (entry?.values ?? [])
    .map((v) => ({ value: v.value, endTime: v.end_time }))
    .sort((a, b) => (a.endTime < b.endTime ? -1 : 1));
}

function totalOf(body: InstagramInsightsResponse, metric: string): number | null {
  const entry = body.data?.find((d) => d.name === metric);
  return entry?.total_value?.value ?? null;
}

/**
 * Fetches `views` + `accounts_engaged` window totals. `views` replaced the
 * deprecated `impressions` metric and only exists as `total_value`, so it
 * cannot share a call with the time-series metrics. If Meta rejects the
 * combined call (e.g. `accounts_engaged` unavailable for the token), retry
 * with `views` alone, then degrade to nulls — a missing total must never
 * sink the whole dashboard.
 */
async function fetchInsightsTotals(
  token: string,
  since: number,
  until: number
): Promise<{ views: number | null; accountsEngaged: number | null }> {
  try {
    const body = await graphGet<InstagramInsightsResponse>(
      `/me/insights?metric=${TOTAL_INSIGHTS_METRICS}&period=day&metric_type=total_value&since=${since}&until=${until}`,
      token
    );
    return {
      views: totalOf(body, 'views'),
      accountsEngaged: totalOf(body, 'accounts_engaged'),
    };
  } catch (err) {
    if (err instanceof GraphTokenExpired) throw err;
    addLog(
      `instagram: combined insights totals failed — ${
        err instanceof Error ? err.message : String(err)
      } (retrying views only)`
    );
  }
  try {
    const body = await graphGet<InstagramInsightsResponse>(
      `/me/insights?metric=views&period=day&metric_type=total_value&since=${since}&until=${until}`,
      token
    );
    return { views: totalOf(body, 'views'), accountsEngaged: null };
  } catch (err) {
    if (err instanceof GraphTokenExpired) throw err;
    addLog(
      `instagram: views total unavailable — ${
        err instanceof Error ? err.message : String(err)
      }`
    );
    return { views: null, accountsEngaged: null };
  }
}

function isInsightsPermissionError(err: unknown): boolean {
  return (
    err instanceof Error &&
    !(err instanceof GraphTokenExpired) &&
    /permission/i.test(err.message)
  );
}

/**
 * Fetches account insights for a rolling window (`GET /me/insights`).
 * Two calls share one token scope: a time-series call (daily `reach` +
 * `follower_count`) and a totals call (`views` + `accounts_engaged`,
  * `metric_type=total_value`). Requires Graph API v22.0+ (pinned v26.0) and the
 * `instagram_business_manage_insights` scope on the token.
 *
 * @throws Error("session_expired") when the stored token is unusable.
 * @throws Error("insights_permission") when the token predates the insights
 *   scope — reconnect Instagram to grant it.
 */
export async function fetchAccountInsights(
  windowDays = 28
): Promise<InstagramAccountInsights> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - windowDays * 86_400;
  try {
    return await executeWithRetry(() =>
      callWithFreshToken(async (token) => {
        const [seriesBody, totals] = await Promise.all([
          graphGet<InstagramInsightsResponse>(
            `/me/insights?metric=${SERIES_INSIGHTS_METRICS}&period=day&since=${since}&until=${until}`,
            token
          ),
          fetchInsightsTotals(token, since, until),
        ]);
        return {
          reach: seriesPoints(seriesBody, 'reach'),
          followerCount: seriesPoints(seriesBody, 'follower_count'),
          viewsTotal: totals.views,
          accountsEngagedTotal: totals.accountsEngaged,
          windowDays,
        };
      })
    );
  } catch (err) {
    if (isInsightsPermissionError(err)) {
      throw new Error('insights_permission');
    }
    throw err;
  }
}

/**
 * Disconnects Instagram fully: clears OAuth token, session JSON, and
 * onboarding flag on the creators row. After this, token resolution fails
 * and reconnect must run a fresh OAuth authorize (with force_reauth).
 * No-op if no creator row exists.
 */
export async function disconnectInstagram(): Promise<void> {
  const user = await account.get();
  const creator = await getCreatorByClerkId(user.$id);
  if (!creator || !creator.$id) return;
  await clearCreatorInstagramAuth(creator.$id);
  addLog(`ig: disconnected creator_row=${creator.$id.slice(0, 12)}…`);
}
