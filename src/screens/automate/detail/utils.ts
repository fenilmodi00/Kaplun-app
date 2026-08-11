import type { Automation, AutomationLog } from '@/lib/automations';
import type { ThemeColors } from '@/lib/theme';

export const ACCENTS = {
  teal: '#1a3a3a',
  ochre: '#e8b94a',
  pink: '#ff4d8b',
  mint: '#a4d4c5',
  mintTint: 'rgba(164, 212, 197, 0.25)',
  ochreTint: 'rgba(232, 185, 74, 0.20)',
  error: '#ef4444',
};

/** Action badge colors per DESIGN.md §3.3 */
export function actionMeta(t: ThemeColors): Record<string, { bg: string; text: string; label: string }> {
  return {
    dm_sent: { bg: ACCENTS.teal, text: t.onPrimary, label: 'Sent' },
    button_dm_sent: { bg: ACCENTS.teal, text: t.onPrimary, label: 'Sent' },
    reveal_sent: { bg: ACCENTS.teal, text: t.onPrimary, label: 'Sent' },
    reply_sent: { bg: ACCENTS.teal, text: t.onPrimary, label: 'Sent' },
    skipped: { bg: ACCENTS.ochre, text: t.ink, label: 'Skipped' },
    failed: { bg: ACCENTS.pink, text: t.onPrimary, label: 'Failed' },
    pending: { bg: t.surfaceCard, text: t.muted, label: 'Pending' },
  };
}

export function statusMeta(t: ThemeColors): Record<string, { bg: string; text: string }> {
  return {
    active: { bg: ACCENTS.mint, text: t.ink },
    paused: { bg: ACCENTS.ochre, text: t.ink },
    error: { bg: ACCENTS.pink, text: t.onPrimary },
  };
}

export function computeStats(logs: AutomationLog[]) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const log of logs) {
    const action = log.action;
    if (action === 'dm_sent' || action === 'button_dm_sent' || action === 'reveal_sent' || action === 'reply_sent') {
      sent += 1;
    } else if (action === 'skipped') {
      skipped += 1;
    } else if (action === 'failed') {
      failed += 1;
    }
  }
  return { sent, skipped, failed };
}

export function targetLabel(automation: Automation): string {
  switch (automation.target_type) {
    case 'all_posts':
      return 'All posts';
    case 'specific_posts':
      return `Specific posts (${automation.media_ids.length})`;
    case 'next_reel':
      return 'Next reel';
    default:
      return 'Unknown';
  }
}
