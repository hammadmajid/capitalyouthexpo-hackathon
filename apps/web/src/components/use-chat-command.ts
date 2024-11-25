import { useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { RetainedChatCommand, executeChatCommand, type ChatCommand } from '@hsm/api-client';
import { browserClient } from '../lib/client';
export function useChatCommand(actorId: string) {
  const cache = useQueryClient(),
    retained = useRef<RetainedChatCommand | null>(null);
  retained.current ??= new RetainedChatCommand((command, key) =>
    executeChatCommand(browserClient(), actorId, command, key),
  );
  const intent = retained.current;
  const mutation = useMutation({
    retry: false,
    gcTime: 0,
    mutationFn: (command: ChatCommand | undefined) =>
      command ? intent.send(command, crypto.randomUUID()) : intent.retry(),
    onSuccess: async () => {
      intent.reset();
      await cache.invalidateQueries({ queryKey: ['chat', actorId] });
    },
  });
  return { mutation, locked: mutation.isPending || intent.locked };
}
