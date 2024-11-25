import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RoomTypeAmenities } from './room-type-amenities';
const actorId = randomUUID(),
  branchId = randomUUID(),
  roomTypeId = randomUUID();
const wifi = { code: 'wifi', name: 'Wi-Fi', isActive: true },
  heater = { code: 'heater', name: 'Heater', isActive: true };
const state = { branchId, roomTypeId, version: 'a'.repeat(64), canEdit: true, amenities: [wifi] };
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(input, init);
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
  const tree = (actor = actorId, branch = branchId, room = roomTypeId) => (
    <QueryClientProvider client={cache}>
      <RoomTypeAmenities actorId={actor} branchId={branch} roomTypeId={room} roomLabel="Two beds" />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
const catalog = () =>
  Response.json({ data: [{ code: heater.code, name: heater.name }], nextCursor: null });
const open = () =>
  fireEvent.click(screen.getByRole('button', { name: 'View amenities for Two beds' }));
async function edit() {
  open();
  const button = await screen.findByRole('button', { name: 'Edit room amenities' });
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}
const submit = () =>
  fireEvent.submit(screen.getByRole('form', { name: 'Room-type amenity selection' }));
it('ROOM-002 / ACC-004: lazy actual read-only selections show names without privileged controls or identifiers', async () => {
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ ...state, canEdit: false }));
  setup(fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  open();
  await screen.findByText('Editing room amenities requires a listing grant.');
  expect(screen.getByText('Wi-Fi')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit room amenities' })).toBeNull();
  expect(document.body.textContent).not.toContain(roomTypeId);
  expect(document.body.textContent).not.toContain(actorId);
});
it('ROOM-002: only a matching persisted response displays save success and current selections', async () => {
  let current = state;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (new URL(request.url).pathname.endsWith('/marketplace/amenities')) return catalog();
      if (request.method === 'PUT') {
        expect(await request.json()).toEqual({ amenityCodes: ['heater', 'wifi'] });
        expect(request.headers.get('If-Match')).toBe('"' + state.version + '"');
        current = { ...state, version: 'b'.repeat(64), amenities: [heater, wifi] };
      }
      return Response.json(current);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Heater'));
  submit();
  await screen.findByText('Room amenities saved.');
  expect(screen.getAllByRole('listitem').map((row) => row.textContent)).toEqual([
    'Heater',
    'Wi-Fi',
  ]);
  expect(screen.queryByRole('form')).toBeNull();
});
it('ROOM-002: interrupted identical retries retain selected choices and the same canonical command key', async () => {
  const keys: (string | null)[] = [];
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (new URL(request.url).pathname.endsWith('/marketplace/amenities')) return catalog();
      if (request.method === 'PUT') {
        keys.push(request.headers.get('Idempotency-Key'));
        if (keys.length === 1) throw new TypeError('Offline');
        return Response.json({ ...state, version: 'b'.repeat(64), amenities: [heater, wifi] });
      }
      return Response.json(state);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Heater'));
  submit();
  await screen.findByRole('alert');
  await waitFor(() =>
    expect(
      (
        screen
          .getByRole('button', { name: 'Save room amenities' })
          .closest('fieldset') as HTMLFieldSetElement
      ).disabled,
    ).toBe(false),
  );
  expect((screen.getByLabelText('Heater') as HTMLInputElement).checked).toBe(true);
  submit();
  await screen.findByText('Room amenities saved.');
  expect(keys).toHaveLength(2);
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
});
it('ACC-004: mismatched persisted room scope cannot display save success', async () => {
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (new URL(request.url).pathname.endsWith('/marketplace/amenities')) return catalog();
      return Response.json(
        request.method === 'PUT' ? { ...state, roomTypeId: randomUUID() } : state,
      );
    }),
  );
  await edit();
  submit();
  await screen.findByRole('alert');
  expect(screen.queryByText('Room amenities saved.')).toBeNull();
  expect(screen.getByRole('form')).toBeDefined();
});
it('ROOM-002: changed saved values retain a dirty draft until explicit reload', async () => {
  let changed = false;
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (new URL(requestOf(input, init).url).pathname.endsWith('/marketplace/amenities'))
        return catalog();
      return Response.json(changed ? { ...state, version: 'b'.repeat(64), amenities: [] } : state);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Heater'));
  changed = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh room amenity access' }));
  await screen.findByText(/Saved room amenities changed/);
  expect((screen.getByLabelText('Heater') as HTMLInputElement).checked).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload current room amenities' }));
  expect((screen.getByLabelText('Heater') as HTMLInputElement).checked).toBe(false);
});
it('ACC-004: refresh outage preserves dirty choices while blocking every write', async () => {
  let offline = false;
  const writes = vi.fn();
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (new URL(request.url).pathname.endsWith('/marketplace/amenities')) return catalog();
      if (request.method === 'PUT') writes();
      if (offline) throw new TypeError('Offline');
      return Response.json(state);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Heater'));
  offline = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh room amenity access' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Heater') as HTMLInputElement).checked).toBe(true);
  submit();
  expect(writes).not.toHaveBeenCalled();
});
it('ACC-004: valid grant revocation hides the editor while retaining readable selected names', async () => {
  let canEdit = true;
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) =>
        new URL(requestOf(input, init).url).pathname.endsWith('/marketplace/amenities')
          ? catalog()
          : Response.json({ ...state, canEdit }),
      ),
  );
  await edit();
  canEdit = false;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh room amenity access' }));
  await screen.findByText('Editing room amenities requires a listing grant.');
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.getByText('Wi-Fi')).toBeDefined();
});
it('ACC-004: definitive scope denial hides cached room selections and drafts', async () => {
  let denied = false;
  setup(
    vi
      .fn<typeof fetch>()
      .mockImplementation(async (input, init) =>
        new URL(requestOf(input, init).url).pathname.endsWith('/marketplace/amenities')
          ? catalog()
          : denied
            ? problem('FORBIDDEN', 403)
            : Response.json(state),
      ),
  );
  await edit();
  denied = true;
  fireEvent.click(screen.getByRole('button', { name: 'Refresh room amenity access' }));
  await screen.findByRole('button', { name: 'Retry room amenity access' });
  expect(screen.queryByRole('form')).toBeNull();
  expect(screen.queryByText('Wi-Fi')).toBeNull();
});
it.each(['actor', 'branch', 'room'] as const)(
  'ACC-004: changing %s remounts the module and discards the old draft',
  async (change) => {
    const value = setup(
      vi
        .fn<typeof fetch>()
        .mockImplementation(async (input, init) =>
          new URL(requestOf(input, init).url).pathname.endsWith('/marketplace/amenities')
            ? catalog()
            : Response.json(state),
        ),
    );
    await edit();
    fireEvent.click(screen.getByLabelText('Heater'));
    value.rerender(
      value.tree(
        change === 'actor' ? randomUUID() : actorId,
        change === 'branch' ? randomUUID() : branchId,
        change === 'room' ? randomUUID() : roomTypeId,
      ),
    );
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.getByRole('button', { name: 'View amenities for Two beds' })).toBeDefined();
  },
);
it('ROOM-002: cancel and close discard unsaved changes without PUT', async () => {
  const writes = vi.fn();
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (request.method === 'PUT') writes();
      return new URL(request.url).pathname.endsWith('/marketplace/amenities')
        ? catalog()
        : Response.json(state);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Heater'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel room amenity edit' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close room amenities' }));
  expect(writes).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'View amenities for Two beds' })).toBeDefined();
});

it('ACC-004: a late mutation after account change cannot restore the former private cache or success UI', async () => {
  let finish: ((response: Response) => void) | undefined;
  const pending = new Promise<Response>((resolve) => {
    finish = resolve;
  });
  const value = setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const request = requestOf(input, init);
      if (new URL(request.url).pathname.endsWith('/marketplace/amenities')) return catalog();
      return request.method === 'PUT' ? pending : Response.json(state);
    }),
  );
  await edit();
  submit();
  await waitFor(() =>
    expect(
      (
        screen
          .getByRole('button', { name: 'Save room amenities' })
          .closest('fieldset') as HTMLFieldSetElement
      ).disabled,
    ).toBe(true),
  );
  value.rerender(value.tree(randomUUID()));
  const oldKey = ['room-amenities', actorId, branchId, roomTypeId];
  await waitFor(() => expect(value.cache.getQueryData(oldKey)).toBeUndefined());
  const release = finish;
  if (!release) throw new Error('Missing pending mutation');
  await act(async () => {
    release(Response.json({ ...state, version: 'b'.repeat(64) }));
    await pending;
  });
  expect(value.cache.getQueryData(oldKey)).toBeUndefined();
  expect(screen.queryByText('Room amenities saved.')).toBeNull();
  expect(screen.getByRole('button', { name: 'View amenities for Two beds' })).toBeDefined();
});
