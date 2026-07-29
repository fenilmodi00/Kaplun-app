// src/hooks/useAutomations.ts
import { useAuth, useUser } from '@clerk/expo';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAutomation,
  deleteAutomation,
  listAutomationLogs,
  listAutomations,
  updateAutomation,
  type Automation,
  type AutomationLog,
  type CreateAutomationInput,
} from '@/lib/automations';

export function useAutomations() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['automations', user?.id],
    enabled: !!user,
    queryFn: () => listAutomations(getToken),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['automations'] });

  const toggle = useMutation({
    mutationFn: (automation: Automation) =>
      updateAutomation(getToken, automation.$id, {
        status: automation.status === 'active' ? 'paused' : 'active',
      }),
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: (input: CreateAutomationInput) => createAutomation(getToken, input),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteAutomation(getToken, id),
    onSuccess: invalidate,
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
  };
}

export function useAutomationLogs(automationId: string) {
  const { getToken } = useAuth();
  const query = useQuery({
    queryKey: ['automationLogs', automationId],
    enabled: !!automationId,
    queryFn: () => listAutomationLogs(getToken, automationId),
  });
  return {
    logs: query.data ?? [] as AutomationLog[],
    loading: query.isLoading,
    error: query.error?.message ?? null,
    refresh: query.refetch,
  };
}
