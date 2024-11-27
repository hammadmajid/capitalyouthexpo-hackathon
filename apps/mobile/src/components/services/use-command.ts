import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { retainedCommand, type ApiClient } from '@hsm/api-client';
import { actorClient } from '../../lib/runtime';
// One Idempotency-Key per intent, so an uncertain retry repeats the same command.
export function useNativeCommand<T>(
  operation: string,
  actorId: string,
  run: (client: ApiClient, body: T, key: string) => Promise<unknown>,
  refresh: QueryKey[],
  mutationKey?: QueryKey,
) {
  const cache = useQueryClient();
  const command = retainedCommand(JSON.stringify([operation, actorId, refresh[0]]), randomUUID);
  const mutation = useMutation({
    ...(mutationKey ? { mutationKey } : {}),
    gcTime: 0,
    mutationFn: (body: T) =>
      command.submit(body, async (input, key) => run(await actorClient(actorId), input, key)),
    onSettled: async () => {
      for (const queryKey of refresh) await cache.invalidateQueries({ queryKey });
    },
  });
  return {
    ...mutation,
    unresolved: command.unresolved,
    retryOriginal: () => mutation.mutate(command.original<T>()),
  };
}
