'use client';
import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { retainedCommand } from '@hsm/api-client';
// One Idempotency-Key per intent: a retry after an uncertain network result repeats the same
// command, and settles by refreshing the authoritative server views it touched.
export function useCommand<T>(
  operation: string,
  run: (body: T, key: string) => Promise<unknown>,
  refresh: QueryKey[],
) {
  const cache = useQueryClient();
  const command = retainedCommand(JSON.stringify([operation, refresh[0]]), () =>
    crypto.randomUUID(),
  );
  const mutation = useMutation({
    gcTime: 0,
    mutationFn: (body: T) => command.submit(body, run),
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
