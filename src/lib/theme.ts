import { useColorScheme } from 'react-native';
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Theme palettes for raw-RN islands that bypass the CSS runtime
 * (StyleSheet.create components, system chrome, gradient scrims, glass tint).
 * Token source of truth remains src/global.css — keep these values in sync
 * with the light @theme block and the dark override block.
 */
export const lightColors = {
  canvas: '#fffaf0',
  ink: '#0a0a0a',
  primary: '#0a0a0a',
  onPrimary: '#ffffff',
  hairline: '#e5e5e5',
  muted: '#6a6a6a',
  mutedSoft: '#9a9a9a',
  body: '#3a3a3a',
  bodyStrong: '#1a1a1a',
  surfaceSoft: '#faf5e8',
  surfaceCard: '#f5f0e0',
  surfaceStrong: '#ebe6d6',
  primaryActive: '#1f1f1f',
  buttonSecondary: '#f3f2ed',
  borderSubtle: 'rgba(209, 205, 199, 0.45)',
  error: '#ef4444',
  brandTeal: '#1a3a3a',
  /** EdgeBlur canvas scrim */
  scrimStart: 'rgba(255,250,240,0)',
  scrimMid: 'rgba(255,250,240,0.45)',
  scrimEnd: 'rgba(255,250,240,0.92)',
  /** LiquidGlassView tint */
  glassTint: '#fffaf0',
} as const;

export const darkColors: Record<keyof typeof lightColors, string> = {
  canvas: '#000000',
  ink: '#f5f5f5',
  primary: '#f5f5f5',
  onPrimary: '#050505',
  hairline: '#2a2a2a',
  muted: '#8a8a8a',
  mutedSoft: '#666666',
  body: '#b8b8b8',
  bodyStrong: '#e5e5e5',
  surfaceSoft: '#0a0a0a',
  surfaceCard: '#121212',
  surfaceStrong: '#222222',
  primaryActive: '#d4d4d4',
  buttonSecondary: '#121212',
  borderSubtle: 'rgba(255, 255, 255, 0.08)',
  error: '#ef4444',
  brandTeal: '#1a3a3a',
  scrimStart: 'rgba(0,0,0,0)',
  scrimMid: 'rgba(0,0,0,0.45)',
  scrimEnd: 'rgba(0,0,0,0.92)',
  glassTint: '#121212',
};

export type ThemeColors = typeof lightColors;

export type ThemePreference = 'dark' | 'light';

const STORAGE_KEY = '@kaplun/theme-preference';

let preference: ThemePreference = 'dark';
const listeners = new Set<() => void>();

export function getThemePreference(): ThemePreference {
  return preference;
}

export function subscribeThemePreference(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setThemePreference(next: ThemePreference): void {
  if (next === preference) return;
  preference = next;
  listeners.forEach((listener) => { listener(); });
  void AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
}

export async function hydrateThemePreference(): Promise<void> {
  try {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') {
      if (stored !== preference) {
        preference = stored;
        listeners.forEach((listener) => { listener(); });
      }
    }
  } catch {
    // ignore read failures — default dark is fine
  }
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribeThemePreference, getThemePreference);
}

export function resolveScheme(
  pref: ThemePreference,
  _system: 'light' | 'dark' | 'unspecified' | null | undefined,
): 'light' | 'dark' {
  return pref;
}

export function useThemeScheme(): 'light' | 'dark' {
  const pref = useThemePreference();
  const system = useColorScheme();
  if (process.env.EXPO_OS === 'web') return 'light';
  return resolveScheme(pref, system);
}

export function colorsForScheme(scheme: 'light' | 'dark'): ThemeColors {
  return scheme === 'dark' ? (darkColors as ThemeColors) : lightColors;
}

export function useThemeColors(): ThemeColors {
  return colorsForScheme(useThemeScheme());
}

/* ── CSS variable maps for VariableContextProvider runtime override ──
 * Mechanical mirror of src/global.css @theme tokens — keep in sync.
 * Keys are prefixed with '--color-' to match the CSS custom properties.
 */

export const lightCssVariables: Record<string, string> = {
  '--color-canvas': '#fffaf0',
  '--color-canvas-alt': '#f9f8f5',
  '--color-primary': '#0a0a0a',
  '--color-primary-active': '#1f1f1f',
  '--color-primary-disabled': '#e5e5e5',
  '--color-button-secondary': '#f3f2ed',
  '--color-button-secondary-hover': '#eae8df',
  '--color-ink': '#0a0a0a',
  '--color-body-strong': '#1a1a1a',
  '--color-body': '#3a3a3a',
  '--color-muted': '#6a6a6a',
  '--color-muted-soft': '#9a9a9a',
  '--color-hairline': '#e5e5e5',
  '--color-border-subtle': 'rgba(209, 205, 199, 0.45)',
  '--color-border-strong': 'rgba(10, 10, 10, 0.12)',
  '--color-surface-soft': '#faf5e8',
  '--color-surface-card': '#f5f0e0',
  '--color-surface-strong': '#ebe6d6',
  '--color-surface-input': '#fffaf0',
  '--color-surface-overlay': '#fffaf0',
  '--color-hairline-strong': '#d8d4cc',
  '--color-surface-dark': '#035d44',
  '--color-surface-dark-elevated': '#1a2a2a',
  '--color-on-primary': '#ffffff',
  '--color-on-dark': '#ffffff',
  '--color-brand-pink': '#ff4d8b',
  '--color-brand-teal': '#1a3a3a',
  '--color-brand-lavender': '#b8a4ed',
  '--color-brand-peach': '#ffb084',
  '--color-brand-ochre': '#e8b94a',
  '--color-brand-mint': '#a4d4c5',
  '--color-brand-coral': '#ff6b5a',
  '--color-success': '#22c55e',
  '--color-warning': '#f59e0b',
  '--color-error': '#ef4444',
};

export const darkCssVariables: Record<string, string> = {
  '--color-canvas': '#000000',
  '--color-canvas-alt': '#0a0a0a',
  '--color-primary': '#f5f5f5',
  '--color-primary-active': '#d4d4d4',
  '--color-primary-disabled': '#2a2a2a',
  '--color-button-secondary': '#121212',
  '--color-button-secondary-hover': '#1a1a1a',
  '--color-ink': '#f5f5f5',
  '--color-body-strong': '#e5e5e5',
  '--color-body': '#b8b8b8',
  '--color-muted': '#8a8a8a',
  '--color-muted-soft': '#666666',
  '--color-hairline': '#2a2a2a',
  '--color-border-subtle': 'rgba(255, 255, 255, 0.08)',
  '--color-border-strong': 'rgba(255, 255, 255, 0.16)',
  '--color-surface-soft': '#0a0a0a',
  '--color-surface-card': '#121212',
  '--color-surface-strong': '#222222',
  '--color-surface-input': '#101010',
  '--color-surface-overlay': '#181818',
  '--color-hairline-strong': '#3d3d3d',
  // surface-dark and surface-dark-elevated intentionally keep light values (no dark override)
  '--color-surface-dark': '#035d44',
  '--color-surface-dark-elevated': '#1a2a2a',
  '--color-on-primary': '#050505',
  '--color-on-dark': '#f5f5f5',
  '--color-brand-pink': '#ff5c96',
  '--color-brand-teal': '#77d6c5',
  '--color-brand-lavender': '#c7b7ff',
  '--color-brand-peach': '#ffc09d',
  '--color-brand-ochre': '#f2c65b',
  '--color-brand-mint': '#9de0cb',
  '--color-brand-coral': '#ff826f',
  '--color-success': '#4ade80',
  '--color-warning': '#fbbf24',
  '--color-error': '#fb7185',
};

export function cssVariablesForScheme(scheme: 'light' | 'dark'): Record<string, string> {
  return scheme === 'dark' ? darkCssVariables : lightCssVariables;
}
