import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PublicGallery } from './public-gallery';
const branchId = randomUUID(),
  first = randomUUID(),
  second = randomUUID();
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function show(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (id = branchId) => (
    <QueryClientProvider client={cache}>
      <PublicGallery key={id} branchId={id} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
const photo = (id: string, altText = 'Actual hostel exterior') => ({ id, altText });
it('ROOM-003: actual gallery continuation appends public streams and deduplicates reordered photos', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      Response.json({ branchId, data: [photo(first)], nextCursor: '0:' + first }),
    )
    .mockResolvedValueOnce(
      Response.json({
        branchId,
        data: [photo(first), photo(second, 'Actual room')],
        nextCursor: null,
      }),
    );
  show(fetcher);
  expect(await screen.findByRole('img', { name: 'Actual hostel exterior' })).toBeDefined();
  fireEvent.click(screen.getByRole('button', { name: 'Load more hostel photos' }));
  expect(await screen.findByRole('img', { name: 'Actual room' })).toBeDefined();
  expect(screen.getAllByRole('img')).toHaveLength(2);
  expect(screen.queryByRole('button', { name: 'Load more hostel photos' })).toBeNull();
  const request = fetcher.mock.calls[1]?.[0];
  if (!(request instanceof Request)) throw new Error('Missing actual gallery request');
  expect(new URL(request.url).searchParams.get('cursor')).toBe('0:' + first);
  const destination = new URL(
    screen.getByRole('img', { name: 'Actual room' }).getAttribute('src') ?? '',
    window.location.origin,
  );
  expect(destination.href).toBe(window.location.origin + '/api/v1/marketplace/media/' + second);
});
it('ROOM-003: genuine empty gallery has no invented photos or continuation', async () => {
  show(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ branchId, data: [], nextCursor: null })),
  );
  expect(await screen.findByText('No published hostel photos are available.')).toBeDefined();
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Load more hostel photos' })).toBeNull();
});
it('SEC-003: failed controlled image has a truthful fallback', async () => {
  show(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ branchId, data: [photo(first)], nextCursor: null })),
  );
  fireEvent.error(await screen.findByRole('img'));
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.getByText('Photo unavailable: Actual hostel exterior')).toBeDefined();
});
it('ACC-002: a withdrawn gallery hides cached images and can retry without a false empty state', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ branchId, data: [photo(first)], nextCursor: null }))
    .mockResolvedValueOnce(
      Response.json(
        {
          type: 'about:blank',
          title: 'Unavailable',
          detail: 'Unavailable',
          traceId: randomUUID(),
          code: 'NOT_FOUND',
          status: 404,
        },
        { status: 404 },
      ),
    );
  show(fetcher);
  await screen.findByRole('img');
  fireEvent.click(screen.getByRole('button', { name: 'Refresh hostel photos' }));
  await screen.findByRole('alert');
  expect(screen.queryByRole('img')).toBeNull();
  expect(screen.queryByText('No published hostel photos are available.')).toBeNull();
});
it('ACC-002: another branch never renders cached photos from the preceding branch', async () => {
  const other = randomUUID();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json({ branchId, data: [photo(first)], nextCursor: null }))
    .mockResolvedValueOnce(Response.json({ branchId: other, data: [], nextCursor: null }));
  const view = show(fetcher);
  await screen.findByRole('img');
  view.rerender(view.tree(other));
  await screen.findByText('No published hostel photos are available.');
  expect(screen.queryByRole('img')).toBeNull();
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
});
