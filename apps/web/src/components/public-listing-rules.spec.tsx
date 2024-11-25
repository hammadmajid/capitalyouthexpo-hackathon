import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicListingRules } from './public-listing-rules';
const branchId = randomUUID(),
  first = randomUUID(),
  second = randomUUID();
const caches: QueryClient[] = [];
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
  vi.unstubAllGlobals();
});
const rule = (id = first, body = 'Quiet shared spaces.', sortOrder = 0) => ({
  id,
  body,
  sortOrder,
});
function show(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  caches.push(cache);
  const tree = (id = branchId) => (
    <QueryClientProvider client={cache}>
      <PublicListingRules key={id} branchId={id} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
it('TRUST-006: actual public text is escaped and paged with the server continuation', async () => {
  const text = '<img src=x onerror=alert(1)>Keep shared spaces tidy.';
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({
        branchId,
        data: Array.from({ length: 20 }, (_, sortOrder) =>
          rule(
            sortOrder === 19 ? first : randomUUID(),
            sortOrder === 0 ? text : 'Rule ' + String(sortOrder),
            sortOrder,
          ),
        ),
        nextCursor: '19:' + first,
      }),
    )
    .mockResolvedValueOnce(
      Response.json({ branchId, data: [rule(second, 'Actual later rule.', 20)], nextCursor: null }),
    );
  const view = show(fetcher);
  await screen.findByText(text);
  expect(view.container.querySelector('img')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Load more hostel rules' }));
  await screen.findByText('Actual later rule.');
  expect(screen.getAllByRole('listitem')).toHaveLength(21);
  expect(screen.queryByRole('button', { name: 'Load more hostel rules' })).toBeNull();
  const sent = fetcher.mock.calls[1]?.[0];
  if (!(sent instanceof Request)) throw new Error('Missing rules request');
  expect(new URL(sent.url).searchParams.get('cursor')).toBe('19:' + first);
});
it('ACC-002: genuine empty rules page has no invented text or continuation', async () => {
  show(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ branchId, data: [], nextCursor: null })),
  );
  await screen.findByText('No published hostel rules are available.');
  expect(screen.queryByRole('listitem')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more hostel rules' })).toBeNull();
});
it.each([404, 503])(
  'ACC-002: failed refresh %s hides cached rules and does not claim an empty success',
  async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ branchId, data: [rule()], nextCursor: null }))
      .mockResolvedValueOnce(
        Response.json(
          {
            type: 'about:blank',
            title: 'Unavailable',
            detail: 'Unavailable',
            traceId: randomUUID(),
            code: status === 404 ? 'NOT_FOUND' : 'INTERNAL',
            status,
          },
          { status },
        ),
      );
    show(fetcher);
    await screen.findByText('Quiet shared spaces.');
    fireEvent.click(screen.getByRole('button', { name: 'Refresh hostel rules' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Quiet shared spaces.')).toBeNull();
    expect(screen.queryByText('No published hostel rules are available.')).toBeNull();
  },
);
it('ACC-002: changing branch never displays preceding branch rules', async () => {
  const other = randomUUID(),
    fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json({ branchId, data: [rule()], nextCursor: null }))
      .mockResolvedValueOnce(Response.json({ branchId: other, data: [], nextCursor: null }));
  const view = show(fetcher);
  await screen.findByText('Quiet shared spaces.');
  view.rerender(view.tree(other));
  await screen.findByText('No published hostel rules are available.');
  expect(screen.queryByText('Quiet shared spaces.')).toBeNull();
});
