import type { InsightPoint } from '@/lib/instagram';

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatCompact(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return value.toLocaleString('en-US');
}

/** Meta end_time format: '2024-01-01T00:00:00+0000' — take the date part. */
export function dayLabel(endTime: string): string {
  const parts = endTime.slice(0, 10).split('-').map(Number);
  const month = MONTHS[(parts[1] ?? 1) - 1] ?? '';
  return `${month} ${parts[2] ?? ''}`;
}

export function sumPoints(points: InsightPoint[]): number {
  return points.reduce((acc, p) => acc + p.value, 0);
}
