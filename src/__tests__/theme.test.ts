import { colorsForScheme, lightColors, darkColors } from '@/lib/theme';

describe('theme palettes', () => {
  it('light palette matches current Clay tokens', () => {
    expect(lightColors.canvas).toBe('#fffaf0');
    expect(lightColors.primary).toBe('#0a0a0a');
  });

  it('dark palette is pure-black AMOLED with inverted primary', () => {
    expect(darkColors.canvas).toBe('#000000');
    expect(darkColors.primary).toBe('#f5f5f5');
    expect(darkColors.onPrimary).toBe('#050505');
  });

  it('colorsForScheme selects by scheme', () => {
    expect(colorsForScheme('dark')).toBe(darkColors);
    expect(colorsForScheme('light')).toBe(lightColors);
  });

  it('palettes have identical keys', () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });

  // Dark-theme regression invariants — catch "forgot the dark value" and palette drift
  it('every dark value differs from its light counterpart', () => {
    // These keys are intentionally identical in both palettes (semantic / brand constants)
    const intentionalSame: (keyof typeof lightColors)[] = ['error', 'brandTeal'];
    for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
      if (intentionalSame.includes(key)) continue;
      expect(darkColors[key]).not.toBe(lightColors[key]);
    }
  });
});
