/** Gin/Go client for the AI profile score report. Uses Appwrite JWT auth. */
import { get, post } from '@/lib/api-go-client';

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

/** Latest cached report, or null when the creator has none (backend 404). */
export async function getLatestProfileScore(): Promise<ProfileScoreResult | null> {
  try {
    return await get<ProfileScoreResult>('/reports/profile/latest');
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'not_found') return null;
    throw err;
  }
}

/** Always regenerates — new LLM call server-side. Only ever fired by explicit CTA. */
export async function generateProfileScore(): Promise<ProfileScoreResult> {
  return post<ProfileScoreResult>(
    '/reports/profile/generate',
    {},
    { noRetry: true, timeoutMs: 65_000 },
  );
}
