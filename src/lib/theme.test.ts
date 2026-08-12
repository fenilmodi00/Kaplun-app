import {
  resolveScheme,
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from '@/lib/theme';

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
