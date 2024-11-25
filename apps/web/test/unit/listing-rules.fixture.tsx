import type { ReactElement } from 'react';
import { randomUUID } from 'node:crypto';
import { afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListingRules } from '../../src/components/listing-rules';
const actorId = randomUUID(),
  branchId = randomUUID(),
  ruleId = randomUUID();
const row = {
  id: ruleId,
  branchId,
  body: 'Actual hostel rule.',
  sortOrder: 0,
  version: 'a'.repeat(64),
  createdAt: '2026-10-17T00:00:00Z',
  updatedAt: '2026-10-17T00:00:00Z',
  archivedAt: null,
};
const page = { branchId, state: 'active', canEdit: true, data: [row], nextCursor: null },
  state = { ...row, canEdit: true };
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
  vi.unstubAllGlobals();
});
const sent = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(input, init);
const problem = (code: string, status: number) =>
  Response.json(
    {
      type: 'about:blank',
      title: 'Unavailable',
      detail: 'Unavailable',
      traceId: randomUUID(),
      code,
      status,
    },
    { status },
  );
function show(
  fetcher: typeof fetch,
): RenderResult & { cache: QueryClient; tree: (actor?: string, branch?: string) => ReactElement } {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  caches.push(cache);
  const tree = (actor: string = actorId, branch: string = branchId) => (
    <QueryClientProvider client={cache}>
      <ListingRules actorId={actor} branchId={branch} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'View hostel rules' }));
const submit = () => fireEvent.submit(screen.getByRole('form', { name: 'Hostel rule editor' }));

export { actorId, branchId, ruleId, row, page, state, sent, problem, show, open, submit };
