import type { BadgeProps } from 'panelui-native';
import type { Automation, AutomationLog, AutomationStatus } from '@/lib/automations';

type BadgeVariant = NonNullable<BadgeProps['variant']>;

const SENT_ACTIONS = new Set<AutomationLog['action']>([
  'dm_sent',
  'button_dm_sent',
  'reveal_sent',
  'reply_sent',
]);

export function actionBadgeVariant(action: AutomationLog['action']): BadgeVariant {
  if (SENT_ACTIONS.has(action)) return 'success';
  if (action === 'skipped') return 'warning';
  if (action === 'failed') return 'destructive';
  return 'secondary';
}

export function actionLabel(action: AutomationLog['action']): string {
  if (SENT_ACTIONS.has(action)) return 'Sent';
  if (action === 'skipped') return 'Skipped';
  if (action === 'failed') return 'Failed';
  return 'Pending';
}

export function statusBadgeVariant(status: AutomationStatus): BadgeVariant {
  switch (status) {
    case 'active':
      return 'success';
    case 'paused':
      return 'warning';
    case 'error':
      return 'destructive';
  }
}

export function computeStats(logs: AutomationLog[]) {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const log of logs) {
    if (SENT_ACTIONS.has(log.action)) {
      sent += 1;
    } else if (log.action === 'skipped') {
      skipped += 1;
    } else if (log.action === 'failed') {
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
