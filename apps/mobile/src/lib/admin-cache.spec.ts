import { expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { clearAdminCache } from './admin-cache';
it('SEC-003: revoked staff requests cannot refill removed query data after late completion', async () => {
  const cache = new QueryClient({
    defaultOptions: { queries: { gcTime: Infinity, retry: false } },
  });
  let complete: ((value: string) => void) | undefined;
  const pending = cache
    .fetchQuery({
      queryKey: ['platform-admin', 'actor'],
      queryFn: async ({ signal }) => {
        const result = await new Promise<string>((resolve) => {
          complete = resolve;
        });
        signal.throwIfAborted();
        return result;
      },
    })
    .catch(() => undefined);
  cache.setQueryData(['customer', 'actor'], 'customer fixture');
  clearAdminCache(cache);
  complete?.('private late result');
  await pending;
  expect(cache.getQueryData(['platform-admin', 'actor'])).toBeUndefined();
  expect(cache.getQueryData(['customer', 'actor'])).toBe('customer fixture');
  cache.clear();
});
it('SEC-003: mode exit removes cached staff mutation responses without clearing Customer mutations', async () => {
  const cache = new QueryClient();
  const staff = cache.getMutationCache().build(cache, {
    mutationKey: ['platform-admin', 'actor'],
    mutationFn: async () => ({ fullName: 'staff fixture' }),
  });
  const customer = cache
    .getMutationCache()
    .build(cache, { mutationKey: ['customer', 'actor'], mutationFn: async () => true });
  await staff.execute(undefined);
  await customer.execute(undefined);
  clearAdminCache(cache);
  expect(cache.getMutationCache().findAll({ mutationKey: ['platform-admin'] })).toHaveLength(0);
  expect(cache.getMutationCache().findAll({ mutationKey: ['customer'] })).toHaveLength(1);
  cache.clear();
});
