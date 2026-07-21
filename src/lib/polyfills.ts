import { addLog, hookGlobalErrors } from '@/lib/logger';
import { Buffer } from 'buffer';

addLog('polyfills.ts: start');

try {
  hookGlobalErrors();
  addLog('polyfills.ts: global error handler hooked');
} catch (e) {
  addLog(`polyfills.ts: error hooking global handler: ${e}`);
}

try {
  if (typeof global.Buffer === 'undefined') {
    global.Buffer = Buffer;
    addLog('polyfills.ts: Buffer polyfill set');
  } else {
    addLog('polyfills.ts: Buffer already present');
  }
} catch (e) {
  addLog(`polyfills.ts: error setting Buffer: ${e}`);
}

/**
 * Polyfill localStorage for React Native / Expo environment.
 * Appwrite JS SDK accesses window.localStorage.getItem('cookieFallback') in Realtime & Auth,
 * which throws "TypeError: Cannot read property 'getItem' of undefined" if window is present but localStorage is undefined.
 */
try {
  const createMemoryStorage = () => {
    const store = new Map<string, string>();
    return {
      getItem: (key: string): string | null => store.get(String(key)) ?? null,
      setItem: (key: string, value: string): void => {
        store.set(String(key), String(value));
      },
      removeItem: (key: string): void => {
        store.delete(String(key));
      },
      clear: (): void => {
        store.clear();
      },
      key: (index: number): string | null => Array.from(store.keys())[index] ?? null,
      get length(): number {
        return store.size;
      },
    };
  };

  const targetGlobal = (typeof globalThis !== 'undefined' ? globalThis : global) as Record<string, any>;

  if (typeof targetGlobal.window === 'undefined') {
    targetGlobal.window = targetGlobal;
  }

  const memoryStorage = createMemoryStorage();

  if (typeof targetGlobal.localStorage === 'undefined' || !targetGlobal.localStorage?.getItem) {
    targetGlobal.localStorage = memoryStorage;
    addLog('polyfills.ts: localStorage polyfill set on global');
  }

  if (targetGlobal.window && (typeof targetGlobal.window.localStorage === 'undefined' || !targetGlobal.window.localStorage?.getItem)) {
    targetGlobal.window.localStorage = memoryStorage;
    addLog('polyfills.ts: localStorage polyfill set on window');
  }
} catch (e) {
  addLog(`polyfills.ts: error setting localStorage: ${e}`);
}

addLog('polyfills.ts: done');
