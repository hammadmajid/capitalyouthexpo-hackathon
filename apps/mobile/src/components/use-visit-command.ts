import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import {
  RetainedVisitCommand,
  executeVisitCommand,
  type VisitWorkflowCommand,
} from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
export function useVisitCommand(actorId: string) {
  const cache = useQueryClient(),
    retained = useRef<RetainedVisitCommand | null>(null);
  retained.current ??= new RetainedVisitCommand(async (command, key) =>
    executeVisitCommand(await actorClient(actorId), command, key),
  );
  const intent = retained.current;
  const kind = useRef<VisitWorkflowCommand['kind'] | undefined>(undefined);
  const targetVisitId = useRef<string | undefined>(undefined);
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (input: VisitWorkflowCommand | undefined) => {
      if (input) {
        kind.current = input.kind;
        targetVisitId.current = 'visitId' in input ? input.visitId : undefined;
        return intent.send(input, randomUUID());
      }
      return intent.retry();
    },
    onSuccess: async () => {
      intent.reset();
      await cache.invalidateQueries({ queryKey: ['visits', actorId] });
    },
    onError: () => {
      void cache.invalidateQueries({ queryKey: ['visits', actorId] });
    },
  });
  return {
    mutation,
    kind: kind.current,
    targetVisitId: targetVisitId.current,
    locked: mutation.isPending || intent.locked,
  };
}
