import { formatCount, statusBadgeVariant } from './utils';

describe('formatCount', () => {
  it('returns the raw number below 1000', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
  });

  it('formats thousands with one decimal and K suffix', () => {
    expect(formatCount(1000)).toBe('1.0K');
    expect(formatCount(1500)).toBe('1.5K');
  });

  it('formats millions with one decimal and M suffix', () => {
    expect(formatCount(1_000_000)).toBe('1.0M');
    expect(formatCount(1_500_000)).toBe('1.5M');
  });
});

describe('statusBadgeVariant', () => {
  it.each([
    ['invited', 'info'],
    ['negotiating', 'warning'],
    ['contracted', 'success'],
    ['content_pending', 'info'],
    ['live', 'success'],
    ['completed', 'secondary'],
    ['declined', 'destructive'],
  ] as const)('maps %s to %s', (status, variant) => {
    expect(statusBadgeVariant(status)).toBe(variant);
  });

  it('falls back to secondary for an unknown status', () => {
    expect(statusBadgeVariant('unknown_status')).toBe('secondary');
  });
});
