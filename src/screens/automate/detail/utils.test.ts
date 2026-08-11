import { computeStats, targetLabel } from './utils';
import type { Automation, AutomationLog } from '@/lib/automations';

function makeLog(action: AutomationLog['action']): AutomationLog {
  return {
    $id: `log-${action}`,
    automation_id: 'auto-1',
    comment_id: 'c1',
    commenter_username: 'user',
    comment_text: 'text',
    matched_keyword: null,
    action,
    reason: null,
    created_at: '2024-01-01T00:00:00Z',
  };
}

function makeAutomation(target_type: Automation['target_type'], media_ids: string[] = []): Automation {
  return {
    $id: 'auto-1',
    clerk_user_id: 'user-1',
    ig_user_id: 'ig-1',
    name: 'Test',
    target_type,
    media_ids,
    bound_media_ids: [],
    keywords: [],
    match_mode: 'whole_word',
    match_any_word: false,
    opening_dm_mode: 'direct',
    dm_message: 'msg',
    button_text: null,
    reveal_message: null,
    public_reply_enabled: false,
    public_reply_message: null,
    public_reply_messages: [],
    require_follow: false,
    follow_prompt_message: null,
    follow_prompt_button_label: null,
    follow_up_enabled: false,
    follow_up_message: null,
    follow_up_delay_minutes: null,
    dm_trigger_enabled: false,
    status: 'active',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

describe('computeStats', () => {
  it('returns zeros for empty log array', () => {
    expect(computeStats([])).toEqual({ sent: 0, skipped: 0, failed: 0 });
  });

  it('counts only sent actions', () => {
    const logs = [
      makeLog('dm_sent'),
      makeLog('button_dm_sent'),
      makeLog('reveal_sent'),
      makeLog('reply_sent'),
    ];
    expect(computeStats(logs)).toEqual({ sent: 4, skipped: 0, failed: 0 });
  });

  it('counts only skipped actions', () => {
    const logs = [makeLog('skipped'), makeLog('skipped')];
    expect(computeStats(logs)).toEqual({ sent: 0, skipped: 2, failed: 0 });
  });

  it('counts only failed actions', () => {
    const logs = [makeLog('failed'), makeLog('failed'), makeLog('failed')];
    expect(computeStats(logs)).toEqual({ sent: 0, skipped: 0, failed: 3 });
  });

  it('counts mixed actions and ignores pending', () => {
    const logs = [
      makeLog('dm_sent'),
      makeLog('skipped'),
      makeLog('failed'),
      makeLog('pending'),
      makeLog('reply_sent'),
      makeLog('skipped'),
    ];
    expect(computeStats(logs)).toEqual({ sent: 2, skipped: 2, failed: 1 });
  });
});

describe('targetLabel', () => {
  it('returns "All posts" for all_posts target', () => {
    expect(targetLabel(makeAutomation('all_posts'))).toBe('All posts');
  });

  it('returns "Specific posts (N)" for specific_posts target', () => {
    expect(targetLabel(makeAutomation('specific_posts', ['m1', 'm2', 'm3']))).toBe('Specific posts (3)');
  });

  it('returns "Next reel" for next_reel target', () => {
    expect(targetLabel(makeAutomation('next_reel'))).toBe('Next reel');
  });

  it('returns "Unknown" for unrecognized target type', () => {
    expect(targetLabel(makeAutomation('unknown' as Automation['target_type']))).toBe('Unknown');
  });
});
