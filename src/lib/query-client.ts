import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

export const PERSIST_MAX_AGE = 24 * 60 * 60_000; // 24h
export const PERSIST_BUSTER = '2';

type QueryStatusShape = { state: { status: 'success' | 'error' | 'pending' } };

/** Persist only settled-success queries — errors/pending must refetch on restore. */
export function shouldPersistQuery(query: QueryStatusShape): boolean {
  return query.state.status === 'success';
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      // gcTime must be >= maxAge or entries are collected before restore runs.
      gcTime: PERSIST_MAX_AGE,
      retry: false,
    },
  },
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: createAsyncStoragePersister({ storage: AsyncStorage }),
  maxAge: PERSIST_MAX_AGE,
  buster: PERSIST_BUSTER,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => {
      return shouldPersistQuery(query);
    },
  },
};
