import type { InsightPoint } from '@/lib/instagram';
import { dayLabel, formatCompact, sumPoints } from './utils';

describe('formatCompact', () => {
  it('passes sub-1000 values through toLocaleString', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
    expect(formatCompact(-50)).toBe('-50');
  });

  it('compacts the 1K–10K range to one decimal, stripping the trailing .0', () => {
    expect(formatCompact(1000)).toBe('1K');
    expect(formatCompact(1500)).toBe('1.5K');
    expect(formatCompact(2000)).toBe('2K');
    expect(formatCompact(9999)).toBe('10K');
  });

  it('rounds to whole K from 10K up to 1M', () => {
    expect(formatCompact(10_000)).toBe('10K');
    expect(formatCompact(42_100)).toBe('42K');
    expect(formatCompact(999_999)).toBe('1000K');
  });

  it('compacts millions to one decimal, stripping the trailing .0', () => {
    expect(formatCompact(1_000_000)).toBe('1M');
    expect(formatCompact(1_500_000)).toBe('1.5M');
    expect(formatCompact(2_000_000)).toBe('2M');
  });
});

describe('dayLabel', () => {
  it('formats Meta end_time dates as short month + day', () => {
    expect(dayLabel('2026-07-29T07:00:00+0000')).toBe('Jul 29');
    expect(dayLabel('2024-01-01T00:00:00+0000')).toBe('Jan 1');
    expect(dayLabel('2026-12-31T23:59:59+0000')).toBe('Dec 31');
  });
});

describe('sumPoints', () => {
  it('returns 0 for an empty series', () => {
    expect(sumPoints([])).toBe(0);
  });

  it('sums point values', () => {
    const points: InsightPoint[] = [
      { value: 150, endTime: '2026-07-29T07:00:00+0000' },
      { value: 120, endTime: '2026-07-30T07:00:00+0000' },
    ];
    expect(sumPoints(points)).toBe(270);
  });
});
