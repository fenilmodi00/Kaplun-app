import { formatRelativeTime, formatTimestamp } from './format-time';

const NOW = new Date('2026-08-11T12:00:00Z');

/** ISO string `msAgo` milliseconds before the frozen clock. */
function iso(msAgo: number): string {
  return new Date(NOW.getTime() - msAgo).toISOString();
}

describe('formatRelativeTime', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "Just now" under one minute, including 0 minutes', () => {
    expect(formatRelativeTime(iso(0))).toBe('Just now');
    expect(formatRelativeTime(iso(30_000))).toBe('Just now');
    expect(formatRelativeTime(iso(59_999))).toBe('Just now');
  });

  it('returns minutes from 1 minute up to 59 minutes', () => {
    expect(formatRelativeTime(iso(60_000))).toBe('1m ago');
    expect(formatRelativeTime(iso(59 * 60_000))).toBe('59m ago');
  });

  it('flips to hours at the 60-minute boundary', () => {
    expect(formatRelativeTime(iso(60 * 60_000))).toBe('1h ago');
    expect(formatRelativeTime(iso(23 * 3_600_000))).toBe('23h ago');
  });

  it('flips to days at the 24-hour boundary', () => {
    expect(formatRelativeTime(iso(24 * 3_600_000))).toBe('1d ago');
    expect(formatRelativeTime(iso(6 * 86_400_000))).toBe('6d ago');
  });

  it('returns a short locale date at the 7-day boundary and older', () => {
    const weekAgo = new Date(NOW.getTime() - 7 * 86_400_000);
    const expected = weekAgo.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    expect(expected).toMatch(/^[A-Z][a-z]{2} \d{1,2}$/);
    expect(formatRelativeTime(weekAgo.toISOString())).toBe(expected);
    expect(formatRelativeTime(iso(30 * 86_400_000))).toBe(
      new Date(NOW.getTime() - 30 * 86_400_000).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      }),
    );
  });

  it('treats future timestamps (negative diff) as "Just now"', () => {
    expect(formatRelativeTime(iso(-60_000))).toBe('Just now');
  });
});

describe('formatTimestamp', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns "" for undefined input', () => {
    expect(formatTimestamp(undefined)).toBe('');
  });

  it('returns "" for empty string input', () => {
    expect(formatTimestamp('')).toBe('');
  });

  it('matches formatRelativeTime output for valid input', () => {
    const fiveMinAgo = iso(5 * 60_000);
    expect(formatTimestamp(fiveMinAgo)).toBe('5m ago');
    expect(formatTimestamp(fiveMinAgo)).toBe(formatRelativeTime(fiveMinAgo));
  });
});
