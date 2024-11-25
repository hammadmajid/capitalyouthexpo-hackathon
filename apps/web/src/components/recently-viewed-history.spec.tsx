import type { ReactNode } from 'react';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { recordRecentlyViewed, useRecentlyViewedIds } from './recently-viewed-history';
let cache: QueryClient;
beforeEach(() => {
  cache = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
});
afterEach(() => {
  cleanup();
  cache.clear();
  vi.restoreAllMocks();
});
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
it('ACC-002: genuine public IDs are canonical, deduplicated, most-recent first and bounded to 20', () => {
  const ids = Array.from({ length: 25 }, () => randomUUID());
  const { result } = renderHook(useRecentlyViewedIds, { wrapper });
  act(() => {
    for (const id of ids) recordRecentlyViewed(cache, id.toUpperCase());
  });
  expect(result.current).toEqual(ids.slice(-20).reverse());
  const previous = ids[20];
  if (!previous) throw new Error('Missing fixture ID');
  act(() => {
    recordRecentlyViewed(cache, previous);
  });
  expect(result.current).toEqual([
    previous,
    ...ids
      .slice(-20)
      .reverse()
      .filter((id) => id !== previous),
  ]);
  expect(result.current).toHaveLength(20);
});
it('ACC-002: invalid IDs do not become browsing history', () => {
  const { result } = renderHook(useRecentlyViewedIds, { wrapper });
  expect(recordRecentlyViewed(cache, 'invalid')).toBe(false);
  expect(result.current).toEqual([]);
});
it('SEC-003: the existing logout/account-change cache clear removes observable history', () => {
  const { result } = renderHook(useRecentlyViewedIds, { wrapper });
  act(() => {
    recordRecentlyViewed(cache, randomUUID());
  });
  expect(result.current).toHaveLength(1);
  act(() => cache.clear());
  expect(result.current).toEqual([]);
});
it('SEC-003: history remains in its own application cache and writes no browser persistence', () => {
  const storage = vi.spyOn(Storage.prototype, 'setItem');
  const other = new QueryClient();
  const { result } = renderHook(useRecentlyViewedIds, { wrapper });
  recordRecentlyViewed(other, randomUUID());
  expect(result.current).toEqual([]);
  act(() => {
    recordRecentlyViewed(cache, randomUUID());
  });
  expect(result.current).toHaveLength(1);
  expect(storage).not.toHaveBeenCalled();
  other.clear();
});
