import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RetainedWaitlistCommand,
  executeWaitlistCommand,
  type WaitlistCommand,
} from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function useWaitlistCommand(actorId: string) {
  const cache = useQueryClient(),
    retained = useRef<RetainedWaitlistCommand | null>(null);
  retained.current ??= new RetainedWaitlistCommand((command, key) =>
    executeWaitlistCommand(browserClient(), command, key),
  );
  const intent = retained.current;
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (command: WaitlistCommand | undefined) =>
      command ? intent.send(command, crypto.randomUUID()) : intent.retry(),
    onSuccess: async () => {
      intent.reset();
      await cache.invalidateQueries({ queryKey: ['waitlist', actorId] });
    },
  });
  return { mutation, locked: mutation.isPending || intent.locked };
}
