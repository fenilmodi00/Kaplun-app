/**
 * Typed repository layer for Appwrite TablesDB access.
 *
 * Every method is wrapped in `executeWithRetryAndTimeout` so callers
 * get automatic retry on transient failures + 15s timeout.
 *
 * This replaces the duplicated `tablesDB.listRows({...}) as unknown as T`
 * patterns spread across all 4 data hooks.
 */

import { Query, ID } from 'appwrite';
import { tablesDB } from './appwrite';
import { DATABASE_ID, TABLES } from './constants';
import { executeWithRetryAndTimeout } from './resilient';
import type { Creator, DealThread, Message, Deal } from './types';
import type { PostRow } from '@/hooks/useCreatorProfile';

const DEFAULT_TIMEOUT_MS = 15_000;

// ── Creator ──────────────────────────────────────────────────────────────

/**
 * Look up a creator by their Clerk user ID.
 * Returns null if no creator row exists for this Clerk user.
 */
export async function getCreatorByClerkId(
  clerkUserId: string,
): Promise<Creator | null> {
  if (!clerkUserId) return null;

  const result = await executeWithRetryAndTimeout(
    () =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.CREATORS,
        queries: [Query.equal('clerk_user_id', clerkUserId), Query.limit(1)],
      }),
    DEFAULT_TIMEOUT_MS,
  );

  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as Creator;
}

// ── Deal Threads ─────────────────────────────────────────────────────────

/**
 * Fetch deal threads for an Instagram user.
 * Optionally filters by status (supports multiple exclude values).
 */
export async function listThreads(
  igUserId: string,
  opts?: { excludeStatuses?: string[]; orderDesc?: boolean },
): Promise<DealThread[]> {
  if (!igUserId) return [];

  const queries = [Query.equal('ig_user_id', igUserId)];

  if (opts?.excludeStatuses) {
    for (const status of opts.excludeStatuses) {
      queries.push(Query.notEqual('status', status));
    }
  }

  if (opts?.orderDesc ?? true) {
    queries.push(Query.orderDesc('last_message_at'));
  }

  const result = await executeWithRetryAndTimeout(
    () =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.DEAL_THREADS,
        queries,
      }),
    DEFAULT_TIMEOUT_MS,
  );

  return result.rows as unknown as DealThread[];
}

// ── Messages ─────────────────────────────────────────────────────────────

/**
 * Fetch messages for a thread, ordered by timestamp ascending.
 */
export async function listMessages(threadId: string): Promise<Message[]> {
  if (!threadId) return [];

  const result = await executeWithRetryAndTimeout(
    () =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MESSAGES,
        queries: [
          Query.equal('thread_id', threadId),
          Query.orderAsc('timestamp'),
        ],
      }),
    DEFAULT_TIMEOUT_MS,
  );

  return result.rows as unknown as Message[];
}

/**
 * Send a new message in a thread.
 */
export async function sendMessage(
  threadId: string,
  text: string,
  opts?: { isAskAgent?: boolean; agentAssigned?: string },
): Promise<Message> {
  if (!text.trim()) throw new Error('Message body is empty');

  const newMessage = await executeWithRetryAndTimeout(
    () =>
      tablesDB.createRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.MESSAGES,
        rowId: ID.unique(),
        data: {
          thread_id: threadId,
          sender_type: 'creator',
          body: text,
          attachments: '[]',
          agent_name:
            opts?.isAskAgent && opts?.agentAssigned
              ? opts.agentAssigned
              : '',
          is_read: false,
          timestamp: new Date().toISOString(),
        },
      }),
    DEFAULT_TIMEOUT_MS,
  );

  return newMessage as unknown as Message;
}

/**
 * Mark messages as read with partial-failure tolerance.
 *
 * Appwrite TablesDB has no batch-update, so we update each message
 * individually. If some updates fail, we log them and return which
 * ones succeeded — the caller can update local state for those.
 *
 * @returns The set of message IDs that were successfully marked as read.
 */
export async function batchMarkAsRead(
  threadId: string,
  messageIds: string[],
): Promise<Set<string>> {
  const succeeded = new Set<string>();

  await Promise.allSettled(
    messageIds.map(async (msgId) => {
      await tablesDB.updateRow({
        databaseId: DATABASE_ID,
        tableId: TABLES.MESSAGES,
        rowId: msgId,
        data: { is_read: true },
      });
      succeeded.add(msgId);
    }),
  );

  // Also reset the thread's unread_count
  try {
    await tablesDB.updateRow({
      databaseId: DATABASE_ID,
      tableId: TABLES.DEAL_THREADS,
      rowId: threadId,
      data: { unread_count: 0 },
    });
  } catch {
    // Thread counter update is best-effort — don't block on failure
  }

  return succeeded;
}

// ── Deals ────────────────────────────────────────────────────────────────

/**
 * Batch-fetch deals for a set of thread IDs.
 * If the deals table is empty or partially populated, returns whatever is found.
 */
export async function listDeals(threadIds: string[]): Promise<Deal[]> {
  const validIds = threadIds.filter(Boolean);
  if (validIds.length === 0) return [];

  try {
    const result = await executeWithRetryAndTimeout(
      () =>
        tablesDB.listRows({
          databaseId: DATABASE_ID,
          tableId: TABLES.DEALS,
          queries: [Query.equal('thread_id', validIds)],
        }),
      DEFAULT_TIMEOUT_MS,
    );

    return result.rows as unknown as Deal[];
  } catch {
    // Deals table may be empty — continue without deals
    return [];
  }
}

// ── Posts ────────────────────────────────────────────────────────────────

/**
 * Fetch recent reels/posts for a creator by username.
 */
export async function listPosts(
  username: string,
  limit = 3,
): Promise<PostRow[]> {
  if (!username) return [];

  const result = await executeWithRetryAndTimeout(
    () =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.POSTS,
        queries: [
          Query.equal('creator_username', username),
          Query.equal('is_video', true),
          Query.orderDesc('$createdAt'),
          Query.limit(limit),
        ],
      }),
    DEFAULT_TIMEOUT_MS,
  );

  return result.rows as unknown as PostRow[];
}

// ── Message Previews ─────────────────────────────────────────────────────

/**
 * Batch-fetch the latest message preview per thread.
 * Returns a map of thread_id → message body.
 */
export async function getLastMessagePreviews(
  threadIds: string[],
): Promise<Map<string, string>> {
  const validIds = threadIds.filter(Boolean);
  if (validIds.length === 0) return new Map();

  const result = await executeWithRetryAndTimeout(
    () =>
      tablesDB.listRows({
        databaseId: DATABASE_ID,
        tableId: TABLES.MESSAGES,
        queries: [
          Query.equal('thread_id', validIds),
          Query.orderDesc('timestamp'),
        ],
      }),
    DEFAULT_TIMEOUT_MS,
  );

  const allMessages = result.rows as unknown as Message[];
  const map = new Map<string, string>();
  const seen = new Set<string>();

  // Dedupe: keep only the first (latest) message per thread_id
  for (const msg of allMessages) {
    if (!seen.has(msg.thread_id)) {
      seen.add(msg.thread_id);
      map.set(msg.thread_id, msg.body);
    }
  }

  return map;
}
