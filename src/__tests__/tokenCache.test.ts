/**
 * tokenCache tests — web localStorage fallback + native SecureStore path.
 *
 * Tests call the factory functions directly (createSecureTokenCache /
 * createWebTokenCache) rather than mocking Platform.OS, which bun's jest
 * doesn't support well.
 */

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import { createWebTokenCache, createSecureTokenCache } from '@/lib/tokenCache';

type MockStorage = {
  getItem: jest.Mock<string | null, [string]>;
  setItem: jest.Mock<void, [string, string]>;
  removeItem: jest.Mock<void, [string]>;
  clear: jest.Mock<void, []>;
  length: number;
  key: jest.Mock<string | null, [number]>;
};

function createMockStorage(): MockStorage {
  const store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => store[key] ?? null),
    setItem: jest.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      for (const k of Object.keys(store)) delete store[k];
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: jest.fn((_index: number) => null),
  };
}

describe('createWebTokenCache', () => {
  describe('with localStorage available', () => {
    let mockStorage: MockStorage;

    beforeEach(() => {
      mockStorage = createMockStorage();
      (globalThis as Record<string, unknown>).localStorage = mockStorage as unknown as Storage;
    });

    afterEach(() => {
      delete (globalThis as Record<string, unknown>).localStorage;
    });

    it('saveToken → getToken round-trips through localStorage', async () => {
      const cache = createWebTokenCache();

      await cache.saveToken('clerk-session', 'jwt-value');
      expect(mockStorage.setItem).toHaveBeenCalledWith('clerk-session', 'jwt-value');

      const result = await cache.getToken('clerk-session');
      expect(result).toBe('jwt-value');
      expect(mockStorage.getItem).toHaveBeenCalledWith('clerk-session');
    });

    it('getToken returns undefined for missing key', async () => {
      const cache = createWebTokenCache();

      const result = await cache.getToken('nonexistent');
      expect(result).toBeUndefined();
    });

    it('clearToken removes the key from localStorage', async () => {
      const cache = createWebTokenCache();

      await cache.saveToken('test-key', 'test-val');
      expect(await cache.getToken('test-key')).toBe('test-val');

      cache.clearToken('test-key');
      expect(mockStorage.removeItem).toHaveBeenCalledWith('test-key');
      expect(await cache.getToken('test-key')).toBeUndefined();
    });

    it('saveToken swallows localStorage errors', async () => {
      mockStorage.setItem = jest.fn((_key: string, _val: string) => {
        throw new Error('QuotaExceededError');
      });
      const cache = createWebTokenCache();

      await expect(cache.saveToken('key', 'val')).resolves.toBeUndefined();
    });

    it('getToken returns undefined when localStorage throws', async () => {
      mockStorage.getItem = jest.fn((_key: string) => {
        throw new Error('Storage error');
      });
      const cache = createWebTokenCache();

      const result = await cache.getToken('any-key');
      expect(result).toBeUndefined();
    });

    it('clearToken swallows localStorage errors', async () => {
      mockStorage.removeItem = jest.fn((_key: string) => {
        throw new Error('Storage error');
      });
      const cache = createWebTokenCache();

      expect(() => cache.clearToken('key')).not.toThrow();
    });
  });

  describe('with localStorage undefined (SSR/edge fallback)', () => {
    beforeEach(() => {
      delete (globalThis as Record<string, unknown>).localStorage;
    });

    it('falls back to in-memory Map and still round-trips', async () => {
      const cache = createWebTokenCache();

      await cache.saveToken('ssr-key', 'ssr-val');
      const result = await cache.getToken('ssr-key');
      expect(result).toBe('ssr-val');

      cache.clearToken('ssr-key');
      expect(await cache.getToken('ssr-key')).toBeUndefined();
    });

    it('getToken returns undefined for missing key in memory fallback', async () => {
      const cache = createWebTokenCache();

      const result = await cache.getToken('never-set');
      expect(result).toBeUndefined();
    });
  });
});

describe('createSecureTokenCache', () => {
  beforeEach(() => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockClear();
    SecureStore.setItemAsync.mockClear();
    SecureStore.deleteItemAsync.mockClear();
  });

  it('saveToken calls SecureStore.setItemAsync', async () => {
    const SecureStore = require('expo-secure-store');
    const cache = createSecureTokenCache();

    await cache.saveToken('native-key', 'native-val');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('native-key', 'native-val');
  });

  it('getToken calls SecureStore.getItemAsync and returns value', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockResolvedValueOnce('stored-token');
    const cache = createSecureTokenCache();

    const result = await cache.getToken('native-key');
    expect(result).toBe('stored-token');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith('native-key');
  });

  it('getToken returns undefined when SecureStore returns null', async () => {
    const cache = createSecureTokenCache();

    const result = await cache.getToken('missing-key');
    expect(result).toBeUndefined();
  });

  it('getToken returns undefined when SecureStore throws', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.getItemAsync.mockRejectedValueOnce(new Error('Keychain error'));
    const cache = createSecureTokenCache();

    const result = await cache.getToken('failing-key');
    expect(result).toBeUndefined();
  });

  it('saveToken swallows SecureStore errors', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.setItemAsync.mockRejectedValueOnce(new Error('Keychain full'));
    const cache = createSecureTokenCache();

    await expect(cache.saveToken('key', 'val')).resolves.toBeUndefined();
  });

  it('clearToken calls SecureStore.deleteItemAsync', async () => {
    const SecureStore = require('expo-secure-store');
    const cache = createSecureTokenCache();

    cache.clearToken('delete-me');
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('delete-me');
  });

  it('clearToken swallows SecureStore errors', async () => {
    const SecureStore = require('expo-secure-store');
    SecureStore.deleteItemAsync.mockImplementationOnce(() => {
      throw new Error('Delete failed');
    });
    const cache = createSecureTokenCache();

    expect(() => cache.clearToken('key')).not.toThrow();
  });
});
