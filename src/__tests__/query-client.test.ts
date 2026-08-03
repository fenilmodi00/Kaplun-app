/**
 * Query client persistence wiring — the module owns the singleton QueryClient
 * and the AsyncStorage persister so the root layout stays declarative and the
 * config is unit-testable.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

import {
  queryClient,
  persistOptions,
  shouldPersistQuery,
  PERSIST_MAX_AGE,
  PERSIST_BUSTER,
} from '@/lib/query-client';

describe('query-client persistence wiring', () => {
  it('keeps gcTime >= maxAge so persisted entries survive until restore', () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(30_000);
    expect(defaults.queries?.gcTime).toBe(PERSIST_MAX_AGE);
    expect(defaults.queries?.retry).toBe(false);
  });

  it('persists for 24h with a buster and an AsyncStorage persister', () => {
    expect(persistOptions.maxAge).toBe(PERSIST_MAX_AGE);
    expect(persistOptions.buster).toBe(PERSIST_BUSTER);
    expect(persistOptions.persister).toBeDefined();
  });

  it('persists only successful queries — errors and pending must refetch', () => {
    expect(shouldPersistQuery({ state: { status: 'success' } })).toBe(true);
    expect(shouldPersistQuery({ state: { status: 'error' } })).toBe(false);
    expect(shouldPersistQuery({ state: { status: 'pending' } })).toBe(false);
  });
});
