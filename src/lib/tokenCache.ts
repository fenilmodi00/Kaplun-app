import * as SecureStore from 'expo-secure-store';
import type { TokenCache } from '@clerk/clerk-expo';

/**
 * Persistent token cache using expo-secure-store.
 * Stores Clerk session tokens in the device's secure enclave (Keychain on iOS,
 * Keystore on Android) so login persists across app restarts.
 */
export const secureTokenCache: TokenCache = {
  async getToken(key: string): Promise<string | undefined | null> {
    try {
      const value = await SecureStore.getItemAsync(key);
      return value ?? undefined;
    } catch {
      return undefined;
    }
  },
  async saveToken(key: string, token: string): Promise<void> {
    try {
      await SecureStore.setItemAsync(key, token);
    } catch {
      // SecureStore may not be available in all environments (e.g. web, simulators)
      // Silently ignore — session will just not persist
    }
  },
  clearToken(key: string): void {
    try {
      SecureStore.deleteItemAsync(key);
    } catch {
      // ignore
    }
  },
};
