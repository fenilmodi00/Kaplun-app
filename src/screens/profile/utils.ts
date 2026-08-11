import type { ThemeColors } from '@/lib/theme';

export const ACCENTS = {
  mint: '#a4d4c5',
  lavender: '#b8a4ed',
  peach: '#ffb084',
  teal: '#1a3a3a',
  ochre: '#e8b94a',
  error: '#ef4444',
};

/** Status chip colors (hex mirror of DESIGN.md §3.3) */
export function statusMeta(t: ThemeColors): Record<string, { bg: string; text: string }> {
  return {
    invited: { bg: ACCENTS.teal, text: t.onPrimary },
    negotiating: { bg: ACCENTS.ochre, text: t.ink },
    contracted: { bg: ACCENTS.mint, text: t.ink },
    content_pending: { bg: ACCENTS.lavender, text: t.onPrimary },
    live: { bg: ACCENTS.mint, text: t.ink },
    completed: { bg: t.surfaceCard, text: t.muted },
    declined: { bg: ACCENTS.error, text: t.onPrimary },
  };
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
