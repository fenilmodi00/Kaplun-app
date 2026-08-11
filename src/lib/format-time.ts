/**
 * Shared relative time formatters.
 *
 * Logic is identical to the private copies consolidated from
 * (messages)/threads.tsx (formatTimestamp), (messages)/[threadId].tsx, and
 * (automate)/[automationId].tsx (both formatRelativeTime).
 */

export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatTimestamp(iso: string | undefined): string {
  if (!iso) return '';
  return formatRelativeTime(iso);
}
