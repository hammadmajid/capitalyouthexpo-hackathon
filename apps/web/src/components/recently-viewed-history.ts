import { useCallback, useSyncExternalStore } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { z } from 'zod';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const history = z
  .array(id)
  .max(20)
  .refine((values) => new Set(values).size === values.length);
const key = ['marketplace-recent-ids'] as const;
const empty: readonly string[] = Object.freeze([]);
// Only public branch IDs live in memory, bounded to 20. No browser/server persistence.
// Auth flows already clear this same QueryClient on logout and identity changes.
export function recordRecentlyViewed(cache: QueryClient, branchId: string) {
  const parsed = id.safeParse(branchId);
  if (!parsed.success) return false;
  cache.setQueryDefaults(key, { gcTime: Infinity });
  cache.setQueryData<readonly string[]>(key, (current) => {
    const previous = history.safeParse(current ?? []);
    return [
      parsed.data,
      ...(previous.success ? previous.data : []).filter((value) => value !== parsed.data),
    ].slice(0, 20);
  });
  return true;
}
export function useRecentlyViewedIds() {
  const cache = useQueryClient();
  const subscribe = useCallback(
    (changed: () => void) =>
      cache.getQueryCache().subscribe((event) => {
        if (event.query.queryKey[0] === key[0]) changed();
      }),
    [cache],
  );
  const snapshot = useCallback(() => cache.getQueryData<readonly string[]>(key) ?? empty, [cache]);
  return useSyncExternalStore(subscribe, snapshot, () => empty);
}
