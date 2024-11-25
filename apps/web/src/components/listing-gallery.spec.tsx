import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListingGallery } from './listing-gallery';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const actorId = randomUUID(),
  branchId = randomUUID();
const image = {
  id: randomUUID(),
  branchId,
  fileId: randomUUID(),
  altText: 'Persisted exterior',
  sortOrder: 4,
  roomId: null,
  bedId: null,
  publishedAt: null,
  archivedAt: null,
  scanStatus: 'clean',
  version: 'a'.repeat(64),
};
const page = { data: [image], nextCursor: null, canEdit: true, canPublish: true };
const problem = (code: string, status: number) =>
  Response.json(
    {
      type: 'about:blank',
      title: 'Request failed',
      detail: 'Fixture',
      traceId: randomUUID(),
      code,
      status,
    },
    { status },
  );
function setup(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (actor = actorId, branch = branchId) => (
    <QueryClientProvider client={cache}>
      <ListingGallery actorId={actor} branchId={branch} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'View listing gallery' }));
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(input, init);
it('ROOM-003: gallery is lazy, displays actual metadata and never exposes raw file/account identifiers', async () => {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(page));
  setup(fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  open();
  expect(await screen.findByText('Persisted exterior')).toBeDefined();
  expect(document.body.textContent).not.toContain(image.fileId);
  expect(document.body.textContent).not.toContain(actorId);
  expect(screen.queryByRole('img')).toBeNull();
});
it('ACC-004: actual read-only gallery permissions hide attach and destructive controls', async () => {
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        Response.json({ ...page, canEdit: false, canPublish: false }),
      ),
  );
  open();
  expect(await screen.findByText(/Editing requires a listing grant/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Add listing image' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit image publication' })).toBeNull();
});
it('ROOM-003: a successful edit displays success only after a validated persisted response', async () => {
  let current = image;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (request.method === 'PUT') {
        current = { ...image, altText: 'Saved new exterior', version: 'b'.repeat(64) };
        return Response.json(current);
      }
      return Response.json({ ...page, data: [current] });
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  fireEvent.change(screen.getByLabelText('Image description'), {
    target: { value: 'Saved new exterior' },
  });
  expect(screen.queryByText(/Image action saved/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Save image action' }));
  expect(await screen.findByText(/Image action saved/)).toBeDefined();
  expect(await screen.findByText('Saved new exterior')).toBeDefined();
  expect(screen.queryByLabelText('Image description')).toBeNull();
});
it('ROOM-003: a stale revision retains dirty input and requires explicit reload', async () => {
  let current = image;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (requestOf(input, init).method === 'PUT') {
        current = { ...image, altText: 'Concurrent saved exterior', version: 'b'.repeat(64) };
        return problem('PRECONDITION_FAILED', 412);
      }
      return Response.json({ ...page, data: [current] });
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  fireEvent.change(screen.getByLabelText('Image description'), {
    target: { value: 'Unsaved exterior draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save image action' }));
  const reload = await screen.findByRole('button', { name: 'Reload current image values' });
  await waitFor(() => expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByLabelText('Image description') as HTMLInputElement).value).toBe(
    'Unsaved exterior draft',
  );
  fireEvent.click(reload);
  expect((screen.getByLabelText('Image description') as HTMLInputElement).value).toBe(
    'Concurrent saved exterior',
  );
  expect(screen.queryByText(/Image action saved/)).toBeNull();
});
it('SEC-003: definitive branch denial hides cached private metadata and draft', async () => {
  let denied = false;
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () =>
        denied ? problem('BRANCH_FORBIDDEN', 403) : Response.json(page),
      ),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gallery access' }));
  expect(await screen.findByRole('button', { name: 'Retry gallery access' })).toBeDefined();
  expect(screen.queryByLabelText('Image description')).toBeNull();
  expect(screen.queryByText('Persisted exterior')).toBeNull();
});
it('ACC-004: refreshed grant revocation hides image mutations', async () => {
  let canEdit = true;
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ...page, canEdit, canPublish: canEdit })),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  canEdit = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gallery access' }));
  expect(await screen.findByText(/Editing requires a listing grant/)).toBeDefined();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit image publication' })).toBeNull();
});
it('ROOM-003: refresh outage retains archival reason while disabling submission', async () => {
  let offline = false;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async () => {
      if (offline) throw new Error('Offline');
      return Response.json(page);
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive image' }));
  fireEvent.change(screen.getByLabelText('Reason for archiving'), {
    target: { value: 'Retained reason' },
  });
  offline = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gallery access' }));
  expect(await screen.findByText(/Gallery could not refresh/)).toBeDefined();
  expect((screen.getByLabelText('Reason for archiving') as HTMLTextAreaElement).value).toBe(
    'Retained reason',
  );
  expect(
    (
      screen
        .getByRole('button', { name: 'Save image action' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true);
});
it('ROOM-003: a removed image never turns a failed edit into a new attachment', async () => {
  let removed = false;
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json({ ...page, data: removed ? [] : [image] })),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  removed = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gallery access' }));
  expect(
    await screen.findByRole('button', { name: 'Close unavailable image action' }),
  ).toBeDefined();
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add listing image' })).toBeNull();
});
it.each(['actor', 'branch'])(
  'SEC-003: changing %s remounts and closes old private gallery state',
  async (changed) => {
    const value = setup(vi.fn<typeof fetch>().mockImplementation(async () => Response.json(page)));
    open();
    fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
    value.rerender(
      value.tree(
        changed === 'actor' ? randomUUID() : actorId,
        changed === 'branch' ? randomUUID() : branchId,
      ),
    );
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'View listing gallery' })).toBeDefined();
  },
);
it('ROOM-003 / AUD-001: failed identical archive retries preserve reason and the original command key', async () => {
  const keys: (string | null)[] = [];
  let archived = false;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (request.method === 'POST') {
        keys.push(request.headers.get('Idempotency-Key'));
        if (keys.length === 1) throw new Error('Interrupted');
        archived = true;
        return Response.json({
          ...image,
          archivedAt: '2026-10-16T10:00:00.000Z',
          version: 'b'.repeat(64),
        });
      }
      return Response.json({ ...page, data: archived ? [] : [image] });
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Archive image' }));
  fireEvent.change(screen.getByLabelText('Reason for archiving'), {
    target: { value: 'Replace exterior' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save image action' }));
  await waitFor(() => expect(keys).toHaveLength(1));
  await waitFor(() =>
    expect(
      (
        screen
          .getByRole('button', { name: 'Save image action' })
          .closest('fieldset') as HTMLFieldSetElement
      ).disabled,
    ).toBe(false),
  );
  expect((screen.getByLabelText('Reason for archiving') as HTMLTextAreaElement).value).toBe(
    'Replace exterior',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save image action' }));
  expect(await screen.findByText(/Image action saved/)).toBeDefined();
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
it('ROOM-003: cursor paging retains actual images and history switches use a separate scoped query', async () => {
  const urls: URL[] = [],
    nextId = randomUUID();
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const url = new URL(requestOf(input, init).url);
      urls.push(url);
      if (url.searchParams.get('state') === 'archived') return Response.json({ ...page, data: [] });
      return Response.json(
        url.searchParams.has('cursor')
          ? { ...page, data: [{ ...image, id: nextId, altText: 'Second exterior' }] }
          : { ...page, nextCursor: image.id },
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Load more gallery images' }));
  expect(await screen.findByText('Second exterior')).toBeDefined();
  expect(screen.getByText('Persisted exterior')).toBeDefined();
  expect(urls.some((url) => url.searchParams.get('cursor') === image.id)).toBe(true);
  fireEvent.change(screen.getByLabelText('Image history'), { target: { value: 'archived' } });
  expect(await screen.findByText('No images are saved in this gallery view.')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Add listing image' })).toBeNull();
});
it('ROOM-003: genuine initial failure is retryable and never an empty gallery success', async () => {
  setup(vi.fn<typeof fetch>().mockImplementation(async () => problem('INTERNAL', 500)));
  open();
  expect(await screen.findByRole('button', { name: 'Retry listing gallery' })).toBeDefined();
  expect(screen.queryByText('No images are saved in this gallery view.')).toBeNull();
});

it('ROOM-003: cover selection waits for actual reordered state and never enables publication', async () => {
  const second = { ...image, id: randomUUID(), altText: 'Previous first image', sortOrder: 0 };
  let current = [image, second];
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (request.method === 'POST') {
        expect(await request.json()).toEqual({});
        current = [
          { ...image, sortOrder: 0, version: 'b'.repeat(64) },
          { ...second, sortOrder: 1, version: 'c'.repeat(64) },
        ];
        return Response.json(current[0]);
      }
      return Response.json({ ...page, data: current });
    }),
  );
  open();
  const title = await screen.findByText('Persisted exterior'),
    card = title.closest('article');
  if (!card) throw new Error('Missing selected image');
  fireEvent.click(within(card).getByRole('button', { name: 'Choose as cover' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save image action' }));
  expect(await screen.findByText(/Image action saved/)).toBeDefined();
  await waitFor(() =>
    expect(screen.getAllByRole('article')[0]?.textContent).toContain('Persisted exterior'),
  );
  expect(screen.queryByRole('img')).toBeNull();
  expect(current.every((entry) => entry.publishedAt === null)).toBe(true);
});

it('ACC-004: live publication revocation preserves the open draft and blocks submission', async () => {
  let canPublish = true;
  const published = { ...image, publishedAt: '2026-10-17T00:00:00.000Z' };
  const fetcher = vi
    .fn<typeof fetch>()
    .mockImplementation(async () => Response.json({ ...page, data: [published], canPublish }));
  setup(fetcher);
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit image publication' }));
  fireEvent.change(screen.getByLabelText('Image description'), {
    target: { value: 'Retained edited description' },
  });
  canPublish = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh gallery access' }));
  await screen.findByText(
    'Publication permission is required for this image action. Your draft is retained.',
  );
  expect((screen.getByLabelText('Image description') as HTMLInputElement).value).toBe(
    'Retained edited description',
  );
  fireEvent.submit(screen.getByRole('form', { name: 'Gallery image action' }));
  expect(
    fetcher.mock.calls.every(([input]) => input instanceof Request && input.method === 'GET'),
  ).toBe(true);
  expect(screen.getByRole('button', { name: 'Cancel image action' })).toBeDefined();
});
