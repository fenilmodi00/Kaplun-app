/** Unified Gin/Go API client. Uses Appwrite JWT auth. */
import { executeWithRetry } from './resilient';
import { getAppwriteJWT } from './auth-session';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
const DEFAULT_TIMEOUT_MS = 15_000;

if (!API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.');
}

export interface ApiGoOpts {
  /** Per-attempt timeout in milliseconds (default: 15_000). */
  timeoutMs?: number;
  /** Override the default retry behavior (GET retries, writes don't). */
  noRetry?: boolean;
}

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAppwriteJWT();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(
  path: string,
  method: string,
  body?: unknown,
  opts?: ApiGoOpts,
): Promise<T> {
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const shouldRetry = opts?.noRetry === undefined ? method === 'GET' : !opts.noRetry;

  const call = async (): Promise<T> => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers: await authHeaders(),
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      if (res.status === 401) throw new Error('session_expired');
      if (res.status === 404) throw new Error('not_found');
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`request failed (${res.status}): ${text.slice(0, 200)}`);
      }
      return (res.status === 204 ? null : await res.json()) as T;
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return shouldRetry ? executeWithRetry(call) : call();
}

export async function get<T>(path: string, opts?: ApiGoOpts): Promise<T> {
  return request<T>(path, 'GET', undefined, opts);
}

export async function post<T>(path: string, body?: unknown, opts?: ApiGoOpts): Promise<T> {
  return request<T>(path, 'POST', body, opts);
}

export async function patch<T>(path: string, body?: unknown, opts?: ApiGoOpts): Promise<T> {
  return request<T>(path, 'PATCH', body, opts);
}

export async function del<T>(path: string, opts?: ApiGoOpts): Promise<T> {
  return request<T>(path, 'DELETE', undefined, opts);
}
