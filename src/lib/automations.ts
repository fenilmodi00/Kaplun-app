/** Gin/Go client for the comment-automation engine. Uses Appwrite JWT auth. */
import { get, post, patch, del } from '@/lib/api-go-client';

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

export async function listAutomations(): Promise<Automation[]> {
  const data = await get<{ automations: Automation[] }>('/automations');
  return data.automations;
}

export async function createAutomation(input: CreateAutomationInput): Promise<Automation> {
  const data = await post<{ automation: Automation }>('/automations', input);
  return data.automation;
}

export async function updateAutomation(id: string, input: PatchAutomationInput): Promise<Automation> {
  const data = await patch<{ automation: Automation }>(`/automations/${id}`, input);
  return data.automation;
}

export async function deleteAutomation(id: string): Promise<void> {
  await del(`/automations/${id}`);
}

export async function listAutomationLogs(id: string): Promise<AutomationLog[]> {
  const data = await get<{ logs: AutomationLog[] }>(`/automations/${id}/logs`);
  return data.logs;
}

export async function listCampaignTemplates(): Promise<CampaignTemplate[]> {
  const data = await get<{ templates: CampaignTemplate[] }>('/automations/templates');
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
  return get<AutomationStats>(`/automations/${automationId}/stats`);
}

export async function getOverviewStats(): Promise<OverviewStats> {
  return get<OverviewStats>('/automations/stats/overview');
}
