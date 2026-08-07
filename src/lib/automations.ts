/** Gin/Go client for the comment-automation engine. Uses Appwrite JWT auth. */
import { executeWithRetry } from './resilient';
import { getAppwriteJWT } from './auth-session';

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
  match_any_word: boolean;
  opening_dm_mode: OpeningDmMode;
  dm_message: string;
  button_text: string | null;
  reveal_message: string | null;
  public_reply_enabled: boolean;
  public_reply_message: string | null;
  public_reply_messages: string[];
  require_follow: boolean;
  follow_prompt_message: string | null;
  follow_prompt_button_label: string | null;
  follow_up_enabled: boolean;
  follow_up_message: string | null;
  follow_up_delay_minutes: number | null;
  dm_trigger_enabled: boolean;
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
  match_any_word?: boolean;
  dm_message: string;
  opening_dm_mode?: OpeningDmMode;
  button_text?: string | null;
  reveal_message?: string | null;
  public_reply_enabled: boolean;
  public_reply_message?: string | null;
  public_reply_messages?: string[];
  require_follow?: boolean;
  follow_prompt_message?: string | null;
  follow_prompt_button_label?: string | null;
  follow_up_enabled?: boolean;
  follow_up_message?: string | null;
  follow_up_delay_minutes?: number | null;
  dm_trigger_enabled?: boolean;
  status?: 'active' | 'paused';
}

export type PatchAutomationInput = Partial<CreateAutomationInput>;

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

async function authHeaders(): Promise<HeadersInit> {
  const token = await getAppwriteJWT();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function request<T>(
  path: string,
  init: RequestInit,
  retry: boolean,
): Promise<T> {
  const call = async (): Promise<T> => {
    const res = await fetchWithTimeout(`${API_BASE_URL}${path}`, {
      ...init,
      headers: await authHeaders(),
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

export async function listAutomations(): Promise<Automation[]> {
  const data = await request<{ automations: Automation[] }>('/automations', { method: 'GET' }, true);
  return data.automations;
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>('/automations', {
    method: 'POST', body: JSON.stringify(input),
  }, false);
  return data.automation;
}

export async function updateAutomation(id: string, patch: PatchAutomationInput): Promise<Automation> {
  const data = await request<{ automation: Automation }>(`/automations/${id}`, {
    method: 'PATCH', body: JSON.stringify(patch),
  }, false);
  return data.automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  await request<null>(`/automations/${id}`, { method: 'DELETE' }, false);
}

export async function listAutomationLogs(id: string): Promise<AutomationLog[]> {
  const data = await request<{ logs: AutomationLog[] }>(`/automations/${id}/logs`, { method: 'GET' }, true);
  return data.logs;
}

export async function listCampaignTemplates(): Promise<CampaignTemplate[]> {
  const data = await request<{ templates: CampaignTemplate[] }>('/automations/templates', { method: 'GET' }, true);
  return data.templates;
}

// ── Stats ──────────────────────────────────────────────────────────────────────

export interface AutomationStats {
  sent: number;
  skipped: number;
  failed: number;
}

export interface OverviewStats {
  sent_7d: number;
  top_keyword_7d: string;
  active_automations: number;
}

export async function getAutomationStats(automationId: string): Promise<AutomationStats> {
  return request<AutomationStats>(`/automations/${automationId}/stats`, { method: 'GET' }, true);
}

export async function getOverviewStats(): Promise<OverviewStats> {
  return request<OverviewStats>('/automations/stats/overview', { method: 'GET' }, true);
}
