/**
 * Test utilities for hook tests.
 *
 * Provides a `createQueryClientWrapper` that wraps components in a
 * `QueryClientProvider` with `retry: false` so React Query tests don't hang
 * on rejected queries.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

export function createQueryClientWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children);
  };
}
