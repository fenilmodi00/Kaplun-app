import { useFonts } from 'expo-font';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

/**
 * Loads Inter font weights needed for Clay design system.
 * - 400: body text, nav links
 * - 500: display headlines (Plain Black substitute), captions
 * - 600: titles, buttons
 *
 * Returns [loaded, error] — use `loaded` to gate rendering until fonts are ready.
 * If `error` is non-null, the caller should show an error fallback or use system fonts.
 */
export function useClayFonts(): [boolean, Error | null] {
  return useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });
}

/**
 * Font family names for direct use in styles.
 * Maps to the expo-font loaded names.
 */
export const CLAY_FONTS = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
} as const;
