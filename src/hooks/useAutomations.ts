// src/hooks/useAutomations.ts
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Channel } from 'appwrite';

import { DATABASE_ID, TABLES } from '@/lib/constants';
import { useAppwriteUser } from '@/hooks/useAppwriteUser';
import { useRealtimeSubscription } from '@/lib/realtime';
import {
  createAutomation,
  deleteAutomation,
  getAutomationStats,
  getOverviewStats,
  listAutomationLogs,
  listAutomations,
  updateAutomation,
  type Automation,
  type AutomationLog,
  type AutomationStats,
  type CreateAutomationInput,
  type OverviewStats,
} from '@/lib/automations';

export function useAutomations() {
  const { data: user } = useAppwriteUser();
  const queryClient = useQueryClient();

  const queryKey = ['automations', user?.$id];

  const query = useQuery({
    queryKey,
    enabled: !!user,
    queryFn: () => listAutomations(),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const toggle = useMutation({
    mutationFn: (automation: Automation) =>
      updateAutomation(automation.$id, {
        status: automation.status === 'active' ? 'paused' : 'active',
      }),
    onMutate: async (automation) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Automation[]>(queryKey);
      const nextStatus = automation.status === 'active' ? 'paused' : 'active';
      queryClient.setQueryData<Automation[]>(queryKey, (prev = []) =>
        prev.map((a) => (a.$id === automation.$id ? { ...a, status: nextStatus } : a)),
      );
      return { previous };
    },
    onError: (_err, _automation, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });

  const create = useMutation({
    mutationFn: (input: CreateAutomationInput) => createAutomation(input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAutomation(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Automation[]>(queryKey);
      queryClient.setQueryData<Automation[]>(queryKey, (prev = []) =>
        prev.filter((a) => a.$id !== id),
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: invalidate,
  });

  return {
    automations: query.data ?? [],
    loading: query.isLoading,
    error: query.error?.message === 'session_expired' ? 'session_expired' : (query.error?.message ?? null),
    refresh: query.refetch,
    toggleStatus: toggle.mutateAsync,
    createAutomation: create.mutateAsync,
    deleteAutomation: remove.mutateAsync,
    creating: create.isPending,
    toggling: toggle.isPending,
    togglingId: toggle.isPending && toggle.variables ? toggle.variables.$id : null,
    removing: remove.isPending,
    removingId: remove.isPending && remove.variables ? remove.variables : null,
  };
}

export function useAutomationLogs(automationId: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automationLogs', automationId],
    enabled: !!automationId,
    queryFn: () => listAutomationLogs(automationId),
  });

  const logsChannel = useMemo(
    () => Channel.tablesdb(DATABASE_ID).table(TABLES.AUTOMATION_LOGS).row().create(),
    [],
  );

  useRealtimeSubscription(logsChannel.toString(), (event) => {
    const newLog = event.payload as AutomationLog | undefined;
    // Synthetic events (subscribe success / app foreground) carry no payload — refetch.
    if (!newLog || newLog.automation_id === automationId) {
      queryClient.invalidateQueries({ queryKey: ['automationLogs', automationId] });
    }
  });

  return {
    logs: query.data ?? [] as AutomationLog[],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}

export function useOverviewStats() {
  const query = useQuery({
    queryKey: ['overviewStats'],
    queryFn: () => getOverviewStats(),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  return {
    stats: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}

export function useAutomationStats(automationId: string) {
  const query = useQuery({
    queryKey: ['automationStats', automationId],
    enabled: !!automationId,
    queryFn: () => getAutomationStats(automationId),
    staleTime: 30_000,
    gcTime: 5 * 60_000,
    retry: false,
  });
  return {
    stats: query.data ?? null,
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}
