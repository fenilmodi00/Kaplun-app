/** PanelUI Badge variants this screen maps statuses into. */
export type DealBadgeVariant = 'secondary' | 'destructive' | 'success' | 'warning' | 'info';

/** Deal status -> semantic Badge variant (hue-faithful to the old Clay accents). */
export function statusBadgeVariant(status: string): DealBadgeVariant {
  switch (status) {
    case 'invited':
      return 'info';
    case 'negotiating':
      return 'warning';
    case 'contracted':
    case 'live':
      return 'success';
    case 'content_pending':
      return 'info';
    case 'declined':
      return 'destructive';
    default:
      return 'secondary';
  }
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
