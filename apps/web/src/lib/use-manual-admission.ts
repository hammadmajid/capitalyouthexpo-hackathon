import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createManualStay, ClientFailure, ApiFailure } from '@hsm/api-client';
import { manualAdmissionCommandSchema, type ManualAdmissionCommand } from '@hsm/contracts';
import { browserClient } from './client';
import { useAdmissionAccess } from './use-admission-access';
type Intent = {
  scope: string;
  serialized: string;
  key: string;
  command: ManualAdmissionCommand;
  completed: boolean;
  uncertain: boolean;
};
async function submitIntent(
  reference: { current: Intent | undefined },
  scope: string,
  branchId: string,
  allowed: boolean,
  input: ManualAdmissionCommand,
) {
  if (!allowed) throw new ClientFailure('INVALID_RESPONSE');
  const command = manualAdmissionCommandSchema.parse(input),
    serialized = JSON.stringify(command),
    previous = reference.current;
  if (previous && (previous.scope !== scope || previous.serialized !== serialized))
    throw new ClientFailure('INVALID_RESPONSE');
  const selected = previous ?? {
    scope,
    serialized,
    key: crypto.randomUUID(),
    command,
    completed: false,
    uncertain: false,
  };
  reference.current = selected;
  try {
    const result = await createManualStay(
      browserClient(),
      branchId,
      selected.command,
      selected.key,
    );
    selected.completed = true;
    selected.uncertain = false;
    return result;
  } catch (error) {
    retainFailure(reference, selected, error);
    throw error;
  }
}
function retainFailure(
  reference: { current: Intent | undefined },
  selected: Intent,
  error: unknown,
) {
  const rejected =
    error instanceof ApiFailure && error.problem.status >= 400 && error.problem.status < 500;
  if (rejected && !selected.uncertain && !selected.completed) reference.current = undefined;
  else if (!selected.completed) selected.uncertain = true;
}
export function useManualAdmission(actorId: string, branchId: string, unavailable: boolean) {
  const cache = useQueryClient(),
    intent = useRef<Intent | undefined>(undefined),
    [refreshFailed, setRefreshFailed] = useState(false),
    scope = actorId + ':' + branchId;
  const { access, allowed } = useAdmissionAccess(actorId, branchId, unavailable);
  const mutation = useMutation({
    gcTime: 0,
    retry: false,
    scope: { id: 'manual-admission:' + scope },
    mutationFn: (input: ManualAdmissionCommand) =>
      submitIntent(intent, scope, branchId, allowed, input),
    onSuccess: async () => {
      const outcomes = await Promise.allSettled([
        cache.invalidateQueries({ queryKey: ['private-stays', actorId, branchId] }),
        cache.invalidateQueries({ queryKey: ['branch-inventory-pages', actorId, branchId] }),
        cache.invalidateQueries({ queryKey: ['branch-inventory', actorId, branchId] }),
      ]);
      setRefreshFailed(outcomes.some((outcome) => outcome.status === 'rejected'));
    },
    onError: () => {
      void access.refetch();
    },
  });
  return {
    access,
    allowed,
    mutation,
    refreshFailed,
    lockedCommand: intent.current?.command,
    completed: intent.current?.completed === true,
    uncertain: mutation.isError && intent.current?.uncertain === true,
  };
}
