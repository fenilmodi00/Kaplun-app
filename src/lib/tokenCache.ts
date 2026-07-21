import * as SecureStore from 'expo-secure-store';
import type { TokenCache } from '@clerk/clerk-expo';

export function createSecureTokenCache(): Required<TokenCache> {
  return {
    async getToken(key: string): Promise<string | undefined | null> {
      try {
        const value = await SecureStore.getItemAsync(key);
        return value ?? undefined;
      } catch (err) {
        return undefined;
      }
    },
    async saveToken(key: string, token: string): Promise<void> {
      try {
        await SecureStore.setItemAsync(key, token);
      } catch (err) {
        // SecureStore may not be available in all environments (e.g. simulators)
      }
    },
    clearToken(key: string): void {
      try {
        SecureStore.deleteItemAsync(key);
      } catch (err) {
        // ignore
      }
    },
  };
}

export function createWebTokenCache(): Required<TokenCache> {
  const storage =
    typeof globalThis.localStorage !== 'undefined'
      ? globalThis.localStorage
      : new Map<string, string>();

  const getStorage = (key: string): string | null => {
    if (storage instanceof Map) {
      return storage.get(key) ?? null;
    }
    return storage.getItem(key);
  };

  const setStorage = (key: string, value: string): void => {
    if (storage instanceof Map) {
      storage.set(key, value);
    } else {
      storage.setItem(key, value);
    }
  };

  const removeStorage = (key: string): void => {
    if (storage instanceof Map) {
      storage.delete(key);
    } else {
      storage.removeItem(key);
    }
  };

  return {
    async getToken(key: string): Promise<string | undefined | null> {
      try {
        return getStorage(key) ?? undefined;
      } catch (err) {
        return undefined;
      }
    },
    async saveToken(key: string, token: string): Promise<void> {
      try {
        setStorage(key, token);
      } catch (err) {
        // localStorage may be full or unavailable
      }
    },
    clearToken(key: string): void {
      try {
        removeStorage(key);
      } catch (err) {
        // ignore
      }
    },
  };
}

import { Platform } from 'react-native';

export const secureTokenCache: TokenCache =
  Platform.OS === 'web'
    ? createWebTokenCache()
    : createSecureTokenCache();

