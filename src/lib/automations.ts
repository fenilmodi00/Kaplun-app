/** FastAPI client for the comment-automation engine. Uses Clerk Bearer auth. */
import { executeWithRetry } from './resilient';

const API_BASE_URL = process.env.EXPO_PUBLIC_IG_API_BASE_URL;
const FETCH_TIMEOUT_MS = 15_000;

if (!API_BASE_URL) {
  throw new Error('EXPO_PUBLIC_IG_API_BASE_URL is not set. Add it to your .env file.');
}

export type TargetType = 'all_posts' | 'specific_posts' | 'next_reel';
export type MatchMode = 'whole_word' | 'partial';
export type AutomationStatus = 'active' | 'paused' | 'error';
export type OpeningDmMode = 'direct' | 'button';

export interface Automation {
  $id: string;
  clerk_user_id: string;
  ig_user_id: string;
  name: string;
  target_type: TargetType;
  media_ids: string[];
  bound_media_ids: string[];
  keywords: string[];
  match_mode: MatchMode;
  opening_dm_mode: OpeningDmMode;
  dm_message: string;
  button_text: string | null;
  reveal_message: string | null;
  track_links: boolean;
  public_reply_enabled: boolean;
  public_reply_message: string | null;
  status: AutomationStatus;
  created_at: string;
  updated_at: string;
}

export interface AutomationLog {
  $id: string;
  automation_id: string;
  comment_id: string;
  commenter_username: string | null;
  comment_text: string | null;
  matched_keyword: string | null;
  action: 'pending' | 'dm_sent' | 'button_dm_sent' | 'reveal_sent' | 'reply_sent' | 'skipped' | 'failed';
  reason: string | null;
  created_at: string;
}

export interface CreateAutomationInput {
  name: string;
  target_type: TargetType;
  media_ids?: string[];
  keywords: string[];
  match_mode: MatchMode;
  dm_message: string;
  opening_dm_mode?: OpeningDmMode;
  button_text?: string | null;
  reveal_message?: string | null;
  public_reply_enabled: boolean;
  public_reply_message?: string | null;
}

export type PatchAutomationInput = Partial<CreateAutomationInput & { status: 'active' | 'paused' }>;
export type GetToken = () => Promise<string | null>;

export interface CampaignTemplate {
  slug: string;
  title: string;
  keywords: string[];
  dm_message: string;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function authHeaders(getToken: GetToken): Promise<HeadersInit> {
  const token = await getToken();
  if (!token) throw new Error('session_expired');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(
  getToken: GetToken,
  path: string,
  init: RequestInit,
  retry: boolean,
): Promise<T> {
  const call = async (): Promise<T> => {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: await authHeaders(getToken),
    });
    if (res.status === 401) throw new Error('session_expired');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`automations request failed (${res.status}): ${body.slice(0, 200)}`);
    }
    return (res.status === 204 ? null : await res.json()) as T;
  };
  return retry ? executeWithRetry(call) : call();
}

export async function listAutomations(getToken: GetToken): Promise<Automation[]> {
  const data = await request<{ automations: Automation[] }>(getToken, '/automations', { method: 'GET' }, true);
  return data.automations;
}

export async function createAutomation(getToken: GetToken, input: CreateAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>(getToken, '/automations', {
    method: 'POST', body: JSON.stringify(input),
  }, false);
  return data.automation;
}

export async function updateAutomation(getToken: GetToken, id: string, patch: PatchAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>(getToken, `/automations/${id}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  }, false);
  return data.automation;
}

export async function deleteAutomation(getToken: GetToken, id: string): Promise<void> {
  await request<null>(getToken, `/automations/${id}`, { method: 'DELETE' }, false);
}

export async function listAutomationLogs(getToken: GetToken, id: string): Promise<AutomationLog[]> {
  const data = await request<{ logs: AutomationLog[] }>(getToken, `/automations/${id}/logs`, { method: 'GET' }, true);
  return data.logs;
}

export async function listCampaignTemplates(getToken: GetToken): Promise<CampaignTemplate[]> {
  const data = await request<{ templates: CampaignTemplate[] }>(getToken, '/automations/templates', { method: 'GET' }, true);
  return data.templates;
}
