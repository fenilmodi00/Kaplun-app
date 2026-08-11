/** Gin/Go client for the AI profile score report. Uses Appwrite JWT auth. */
import { executeWithRetry } from './resilient';
import { getAppwriteJWT } from './auth-session';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
const FETCH_TIMEOUT_MS = 15_000;
/** Generate spans insights sync + one LLM call (~30–60s) — the 15s default would kill it. */
const GENERATE_TIMEOUT_MS = 65_000;

if (!API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.');
}

export type ActionPriority = 'high' | 'medium' | 'low';

export interface ActionItem {
  priority: ActionPriority;
  action: string;
  why: string;
  when_to_post: string;
}

export interface ProfileReport {
  overall_score: number;
  score_label: string;
  one_line_summary: string;
  strengths: string[];
  weaknesses: string[];
  action_plan: ActionItem[];
}

export interface ReportMeta {
  model: string;
  tokens: number;
  created_at: string;
  cached: boolean;
}

export interface ProfileScoreResult {
  report: ProfileReport;
  meta: ReportMeta;
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAppwriteJWT();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(
  path: string,
  init: RequestInit,
  retry: boolean,
  timeoutMs: number,
): Promise<T> {
  const call = async (): Promise<T> => {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: await authHeaders(),
    }, timeoutMs);
    if (res.status === 401) throw new Error('session_expired');
    if (res.status === 404) throw new Error('not_found');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`profile-score request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  };
  return retry ? executeWithRetry(call) : call();
}

/** Latest cached report, or null when the creator has none (backend 404). */
export async function getLatestProfileScore(): Promise<ProfileScoreResult | null> {
  try {
    return await request<ProfileScoreResult>(
      '/reports/profile/latest',
      { method: 'GET' },
      true,
      FETCH_TIMEOUT_MS,
    );
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'not_found') return null;
    throw err;
  }
}

/** Always regenerates — new LLM call server-side. Only ever fired by explicit CTA. */
export async function generateProfileScore(): Promise<ProfileScoreResult> {
  return request<ProfileScoreResult>(
    '/reports/profile/generate',
    { method: 'POST', body: '{}' },
    false,
    GENERATE_TIMEOUT_MS,
  );
}
