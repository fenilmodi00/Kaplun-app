import {
  colorsForScheme,
  lightColors,
  darkColors,
  resolveScheme,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from '@/lib/theme';

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

  it('every dark value differs from its light counterpart', () => {
    const intentionalSame: (keyof typeof lightColors)[] = ['error', 'brandTeal'];
    for (const key of Object.keys(lightColors) as (keyof typeof lightColors)[]) {
      if (intentionalSame.includes(key)) continue;
      expect(darkColors[key]).not.toBe(lightColors[key]);
    }
  });
});

describe('resolveScheme', () => {
  it('returns dark when preference is dark regardless of system', () => {
    expect(resolveScheme('dark', null)).toBe('dark');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('dark', 'dark')).toBe('dark');
  });

  it('returns light when preference is light regardless of system', () => {
    expect(resolveScheme('light', null)).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('light', 'light')).toBe('light');
  });
});

describe('theme preference store', () => {
  afterEach(() => {
    setThemePreference('dark');
  });

  it('defaults to dark', () => {
    expect(getThemePreference()).toBe('dark');
  });

  it('setThemePreference updates value and notifies subscribers', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeThemePreference(listener);

    setThemePreference('light');
    expect(getThemePreference()).toBe('light');
    expect(listener).toHaveBeenCalledTimes(1);

    setThemePreference('dark');
    expect(getThemePreference()).toBe('dark');
    expect(listener).toHaveBeenCalledTimes(2);

    setThemePreference('dark');
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('unsubscribe removes listener', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeThemePreference(listener);
    unsubscribe();

    setThemePreference('light');
    expect(listener).not.toHaveBeenCalled();
    setThemePreference('dark');
  });
});
