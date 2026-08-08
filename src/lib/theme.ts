import { useColorScheme } from 'react-native';

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

export function useThemeScheme(): 'light' | 'dark' {
  return useColorScheme() === 'dark' ? 'dark' : 'light';
}

export function colorsForScheme(scheme: 'light' | 'dark'): ThemeColors {
  return scheme === 'dark' ? (darkColors as ThemeColors) : lightColors;
}

export function useThemeColors(): ThemeColors {
  return colorsForScheme(useThemeScheme());
}
