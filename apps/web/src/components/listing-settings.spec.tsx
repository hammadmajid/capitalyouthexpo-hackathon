import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListingSettings } from './listing-settings';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const actorId = randomUUID(),
  branchId = randomUUID();
const listing = {
  branchId,
  version: 'a'.repeat(64),
  canEdit: true,
  description: 'Persisted description',
  nearbyLandmark: null,
  publicPhone: null,
  publicEmail: null,
  showPublicContact: false,
  amenities: [],
};
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
      <ListingSettings actorId={actor} branchId={branch} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'View listing details' }));
function transport(get: () => Response, put?: () => Response) {
  return vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (new URL(request.url).pathname.endsWith('/amenities'))
      return Response.json({ data: [{ code: 'wifi', name: 'Wi-Fi' }], nextCursor: null });
    return request.method === 'PUT' && put ? put() : get();
  });
}
it('TRUST-006: lazily loads saved values and approved choices without exposing raw IDs', async () => {
  const fetcher = transport(() => Response.json(listing));
  setup(fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  open();
  expect(await screen.findByText('Persisted description')).toBeDefined();
  expect(document.body.textContent).not.toContain(branchId);
  fireEvent.click(screen.getByRole('button', { name: 'Edit listing details' }));
  expect(await screen.findByLabelText('Wi-Fi')).toBeDefined();
});
it('ACC-004: read-only permission hides mutation controls', async () => {
  setup(transport(() => Response.json({ ...listing, canEdit: false })));
  open();
  expect(await screen.findByText(/Editing requires a listing grant/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit listing details' })).toBeNull();
});
it('TRUST-006: only a persisted save displays success and replaces the read projection', async () => {
  setup(
    transport(
      () => Response.json(listing),
      () =>
        Response.json({
          ...listing,
          version: 'b'.repeat(64),
          description: 'New persisted description',
        }),
    ),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'New persisted description' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save listing details' }));
  expect(await screen.findByText('Listing details saved.')).toBeDefined();
  expect(screen.getByText('New persisted description')).toBeDefined();
  expect(screen.queryByLabelText('Description')).toBeNull();
});
it('TRUST-006: stale version retains dirty input until explicit reload and blocks resubmission', async () => {
  let current = listing;
  setup(
    transport(
      () => Response.json(current),
      () => {
        current = { ...listing, version: 'b'.repeat(64), description: 'Concurrent saved value' };
        return problem('PRECONDITION_FAILED', 412);
      },
    ),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unsaved draft' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save listing details' }));
  const reload = await screen.findByRole('button', { name: 'Reload current listing values' });
  await waitFor(() => expect((reload as HTMLButtonElement).disabled).toBe(false));
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Unsaved draft');
  expect(
    (
      screen
        .getByRole('button', { name: 'Save listing details' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true);
  fireEvent.click(reload);
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
    'Concurrent saved value',
  );
  expect(screen.queryByText('Listing details saved.')).toBeNull();
});
it('SEC-003: definitive branch denial removes private drafts', async () => {
  let denied = false;
  setup(transport(() => (denied ? problem('BRANCH_FORBIDDEN', 403) : Response.json(listing))));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Private unsaved draft' },
  });
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh listing access' }));
  expect(await screen.findByRole('button', { name: 'Retry listing access' })).toBeDefined();
  expect(screen.queryByLabelText('Description')).toBeNull();
  expect(document.body.textContent).not.toContain('Private unsaved draft');
});
it.each(['actor', 'branch'])('SEC-003: changing %s closes old private state', async (changed) => {
  const value = setup(transport(() => Response.json(listing)));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  value.rerender(
    value.tree(
      changed === 'actor' ? randomUUID() : actorId,
      changed === 'branch' ? randomUUID() : branchId,
    ),
  );
  expect(screen.queryByLabelText('Description')).toBeNull();
  expect(screen.getByRole('button', { name: 'View listing details' })).toBeDefined();
});
it('TRUST-006: refresh outage retains input while disabling saves', async () => {
  let unavailable = false;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input) => {
      const request = input instanceof Request ? input : new Request(input);
      if (new URL(request.url).pathname.endsWith('/amenities'))
        return Response.json({ data: [], nextCursor: null });
      if (unavailable) throw new Error('Offline');
      return Response.json(listing);
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Retained draft' } });
  unavailable = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh listing access' }));
  expect(await screen.findByText(/Listing access could not refresh/)).toBeDefined();
  expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe(
    'Retained draft',
  );
  expect(
    (
      screen
        .getByRole('button', { name: 'Save listing details' })
        .closest('fieldset') as HTMLFieldSetElement
    ).disabled,
  ).toBe(true);
});

it('TRUST-006: genuine initial failure offers retry without inventing saved values', async () => {
  setup(transport(() => problem('INTERNAL', 500)));
  open();
  expect(await screen.findByRole('button', { name: 'Retry listing details' })).toBeDefined();
  expect(screen.queryByText('Persisted description')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit listing details' })).toBeNull();
});
it('TRUST-006: cancel and close discard a draft without calling PUT', async () => {
  const fetcher = transport(() => Response.json(listing));
  setup(fetcher);
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.change(screen.getByLabelText('Description'), {
    target: { value: 'Discard this draft' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel listing edit' }));
  expect(screen.queryByLabelText('Description')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close listing details' }));
  expect(screen.getByRole('button', { name: 'View listing details' })).toBeDefined();
  expect(
    fetcher.mock.calls.every(([input]) => !(input instanceof Request) || input.method === 'GET'),
  ).toBe(true);
});

it('ACC-004: revoked listing grant hides the editor after a successful permission refresh', async () => {
  let canEdit = true;
  setup(transport(() => Response.json({ ...listing, canEdit })));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  canEdit = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh listing access' }));
  expect(await screen.findByText(/Editing requires a listing grant/)).toBeDefined();
  expect(screen.queryByLabelText('Description')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save listing details' })).toBeNull();
});
it('TRUST-006: approved catalog pagination uses the returned cursor and retains selections', async () => {
  const urls: URL[] = [];
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init),
        url = new URL(request.url);
      urls.push(url);
      if (!url.pathname.endsWith('/amenities')) return Response.json(listing);
      return Response.json(
        url.searchParams.has('cursor')
          ? { data: [{ code: 'wifi', name: 'Wi-Fi' }], nextCursor: null }
          : { data: [{ code: 'parking', name: 'Parking' }], nextCursor: 'parking' },
      );
    }),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit listing details' }));
  fireEvent.click(await screen.findByLabelText('Parking'));
  fireEvent.click(await screen.findByRole('button', { name: 'Load more approved amenities' }));
  expect(await screen.findByLabelText('Wi-Fi')).toBeDefined();
  expect((screen.getByLabelText('Parking') as HTMLInputElement).checked).toBe(true);
  expect(urls.some((url) => url.searchParams.get('cursor') === 'parking')).toBe(true);
  expect(screen.queryByRole('button', { name: 'Load more approved amenities' })).toBeNull();
});
it('TRUST-006: catalog failure has a retry and does not replace existing listing values', async () => {
  let failed = true;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      if (!new URL(request.url).pathname.endsWith('/amenities')) return Response.json(listing);
      if (failed) return problem('INTERNAL', 500);
      return Response.json({ data: [], nextCursor: null });
    }),
  );
  open();
  const retry = await screen.findByRole('button', { name: 'Retry approved amenities' });
  expect(screen.getByText('Persisted description')).toBeDefined();
  failed = false;
  fireEvent.click(retry);
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Retry approved amenities' })).toBeNull(),
  );
});
