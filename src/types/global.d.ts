/* eslint-disable no-var */
/* React Native globals used by lib/polyfills.ts and lib/logger.tsx */

interface ErrorUtils {
  getGlobalHandler(): (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler(handler: (error: unknown, isFatal?: boolean) => void): void;
}

declare var ErrorUtils: ErrorUtils | undefined;

/* Augment NodeJS global to include React Native globals */
declare namespace NodeJS {
  interface Global {
    ErrorUtils: ErrorUtils | undefined;
    Buffer: typeof import('buffer').Buffer | undefined;
    __lastFatalError: unknown;
  }
}
