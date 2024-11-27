import type { QueryClient } from '@tanstack/react-query';
import { isAdminKey } from './admin-access';
// SEC-003: cancellation precedes removal so late reads cannot refill staff caches.
export function clearAdminCache(cache: QueryClient) {
  void cache.cancelQueries({ predicate: (query) => isAdminKey(query.queryKey) });
  cache.removeQueries({ predicate: (query) => isAdminKey(query.queryKey) });
  for (const mutation of cache.getMutationCache().getAll()) {
    if (isAdminKey(mutation.options.mutationKey ?? [])) cache.getMutationCache().remove(mutation);
  }
}
