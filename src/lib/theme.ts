import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Uniwind } from 'uniwind';
import { useThemeMode } from 'panelui-native';

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
  Uniwind.setTheme(next);
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
    Uniwind.setTheme(preference);
  } catch {
    Uniwind.setTheme('dark');
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
  const { mode } = useThemeMode();
  if (process.env.EXPO_OS === 'web') return 'light';
  return mode;
}
