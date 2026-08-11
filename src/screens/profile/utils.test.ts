import { formatCount, statusMeta, ACCENTS } from './utils';
import { lightColors } from '@/lib/theme';

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

describe('statusMeta', () => {
  const meta = statusMeta(lightColors);

  it('maps invited to teal bg with onPrimary text', () => {
    expect(meta.invited).toEqual({ bg: ACCENTS.teal, text: lightColors.onPrimary });
  });

  it('maps negotiating to ochre bg with ink text', () => {
    expect(meta.negotiating).toEqual({ bg: ACCENTS.ochre, text: lightColors.ink });
  });

  it('maps contracted to mint bg with ink text', () => {
    expect(meta.contracted).toEqual({ bg: ACCENTS.mint, text: lightColors.ink });
  });

  it('maps content_pending to lavender bg with onPrimary text', () => {
    expect(meta.content_pending).toEqual({ bg: ACCENTS.lavender, text: lightColors.onPrimary });
  });

  it('maps live to mint bg with ink text', () => {
    expect(meta.live).toEqual({ bg: ACCENTS.mint, text: lightColors.ink });
  });

  it('maps completed to surfaceCard bg with muted text', () => {
    expect(meta.completed).toEqual({ bg: lightColors.surfaceCard, text: lightColors.muted });
  });

  it('maps declined to error bg with onPrimary text', () => {
    expect(meta.declined).toEqual({ bg: ACCENTS.error, text: lightColors.onPrimary });
  });

  it('returns undefined for an unknown status', () => {
    expect(meta.unknown_status).toBeUndefined();
  });
});
