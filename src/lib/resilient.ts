/**
 * Resilience utilities: retry with backoff + timeout wrapper.
 *
 * All Appwrite TablesDB calls and FastAPI proxy fetches should use these
 * to survive transient failures (cold functions, 429 rate limiting,
 * network blips) instead of surfacing errors immediately to the user.
 */

import { addLog } from './logger';

/** The maximum number of jitter milliseconds (±20% of each delay). */
const JITTER_FACTOR = 0.2;

/** HTTP status codes that indicate a retryable transient failure. */
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

/** Appwrite error codes ≥ 500 are server-side transient failures. */
const APPWRITE_RETRYABLE_CODE_MIN = 500;

// ── Types ────────────────────────────────────────────────────────────────

export interface RetryOptions {
  /** Maximum number of attempts (default: 3). */
  attempts?: number;
  /** Backoff delays in milliseconds between attempts (default: [250, 1000, 3000]). */
  backoff?: number[];
  /** Whether to add ±20% random jitter to each delay (default: true). */
  jitter?: boolean;
  /**
   * Custom predicate to determine if an error is retryable.
   * Default: retries network errors, Appwrite code >= 500, HTTP [429,5xx].
   */
  isRetryable?: (err: unknown) => boolean;
}

// ── Default retryable predicate ──────────────────────────────────────────

function defaultIsRetryable(err: unknown): boolean {
  // Network / fetch-level errors (e.g. connection refused, DNS failure)
  if (err instanceof TypeError) return true;

  // DOMException with "abort" is our AbortController timeout — not retryable
  if (err instanceof DOMException && err.name === 'AbortError') return false;

  const typed = err as Record<string, unknown>;

  // Appwrite SDK error: { code: number, message: string }
  if (typeof typed.code === 'number' && typed.code >= APPWRITE_RETRYABLE_CODE_MIN) {
    return true;
  }

  // Standard HTTP error shape: { status: number }
  if (typeof typed.status === 'number' && RETRYABLE_STATUS_CODES.has(typed.status)) {
    return true;
  }

  return false;
}

// ── Jitter helper ────────────────────────────────────────────────────────

function applyJitter(ms: number): number {
  const jitterRange = ms * JITTER_FACTOR * 2; // full ±20% range
  return ms + (Math.random() - 0.5) * jitterRange;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Execute a function with automatic retry on transient failures.
 *
 * Retries up to `attempts` times (default 3) with exponential backoff
 * plus ±20% random jitter to avoid thundering-herd. Only retries errors
 * classified as transient: network errors, HTTP 429/5xx, Appwrite code ≥ 500.
 * Never retries 400/401/403/404 (auth, validation, not-found).
 *
 * @param fn  The async function to execute.
 * @param options  Retry configuration (optional).
 * @returns The resolved value from `fn`.
 * @throws The last error if all attempts are exhausted.
 *
 * @example
 * const rows = await executeWithRetry(() => tablesDB.listRows({...}));
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const attempts = options?.attempts ?? 3;
  const backoff = options?.backoff ?? [250, 1000, 3000];
  const addJitter = options?.jitter ?? true;
  const isRetryable = options?.isRetryable ?? defaultIsRetryable;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;

      if (attempt === attempts || !isRetryable(err)) {
        throw err;
      }

      const delayMs = addJitter
        ? applyJitter(backoff[attempt - 1] ?? 3000)
        : (backoff[attempt - 1] ?? 3000);

      addLog(
        `[resilient] Attempt ${attempt}/${attempts} failed, retrying in ${Math.round(delayMs)}ms: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );

      await delay(delayMs);
    }
  }

  // Should never reach here — the loop always throws on last attempt
  throw lastErr;
}

/**
 * Execute a function with a timeout. If `fn` does not resolve within `ms`
 * milliseconds, the returned promise rejects with an error.
 *
 * Uses `setTimeout` internally (not AbortController) so it works with
 * any async function, not just fetch.
 *
 * @param fn  The async function to execute.
 * @param ms  Timeout in milliseconds.
 * @returns The resolved value from `fn`.
 * @throws An error if `fn` does not complete within `ms`.
 *
 * @example
 * const rows = await executeWithTimeout(() => tablesDB.listRows({...}), 15_000);
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  ms: number,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`Operation timed out after ${ms}ms`));
    }, ms);
  });

  try {
    return await Promise.race([fn(), timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
  }
}

/**
 * Combine retry + timeout into a single call.
 *
 * @param fn  The async function to execute.
 * @param timeoutMs  Timeout in milliseconds (default: 15_000).
 * @param retryOptions  Retry configuration (optional).
 * @returns The resolved value from `fn`.
 *
 * @example
 * const rows = await executeWithRetryAndTimeout(
 *   () => tablesDB.listRows({...}),
 *   15_000,
 *   { attempts: 3 },
 * );
 */
export async function executeWithRetryAndTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = 15_000,
  retryOptions?: RetryOptions,
): Promise<T> {
  return executeWithRetry(() => executeWithTimeout(fn, timeoutMs), retryOptions);
}
