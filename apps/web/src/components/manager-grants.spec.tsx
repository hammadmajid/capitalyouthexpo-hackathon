import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ManagerGrants } from './manager-grants';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const actorId = randomUUID(),
  branchId = randomUUID(),
  assignmentId = randomUUID();
const manager = {
  id: assignmentId,
  userId: randomUUID(),
  branchId,
  fullName: 'Assigned Manager',
  status: 'active',
};
const state = { branchId, assignmentId, permissions: ['inventory_edit'] };
const mutation = { branchId, id: assignmentId, kind: 'manager_grants' };
const problem = (code: string, status: number) =>
  Response.json(
    {
      type: 'about:blank',
      title: 'Failed',
      detail: 'Fixture',
      traceId: randomUUID(),
      code,
      status,
    },
    { status },
  );
const requestOf = (input: RequestInfo | URL, init?: RequestInit) =>
  input instanceof Request ? input : new Request(input, init);
function setup(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (actor = actorId, branch = branchId) => (
    <QueryClientProvider client={cache}>
      <ManagerGrants actorId={actor} branchId={branch} />
    </QueryClientProvider>
  );
  return { cache, tree, ...render(tree()) };
}
function server(command?: (request: Request) => Promise<Response>, read?: () => Response) {
  return vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
    const request = requestOf(input, init),
      path = new URL(request.url).pathname;
    if (path.endsWith('/managers')) return Response.json({ data: [manager], nextCursor: null });
    if (request.method === 'PUT' && command) return command(request);
    return read ? read() : Response.json(state);
  });
}
async function select() {
  fireEvent.click(screen.getByRole('button', { name: 'Configure Manager permissions' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Permissions for Assigned Manager (active)' }),
  );
  await screen.findByRole('button', { name: 'Edit Manager permissions' });
}
async function edit() {
  await select();
  fireEvent.click(screen.getByRole('button', { name: 'Edit Manager permissions' }));
}
it('ACC-004 / CHG-008: lazily selects actual named assignments and displays saved flags without private identifiers or document access', async () => {
  const fetcher = server();
  setup(fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  await edit();
  expect((screen.getByLabelText('Edit physical rooms and beds') as HTMLInputElement).checked).toBe(
    true,
  );
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(false);
  expect(
    screen.getByText(/never allow access to private customer booking documents/),
  ).toBeDefined();
  for (const id of [assignmentId, manager.userId, actorId])
    expect(document.body.textContent).not.toContain(id);
});
it('ACC-004: saved changes require the matching persisted mutation and refreshed actual read', async () => {
  let saved = false;
  const writes: Request[] = [];
  setup(
    server(
      async (request) => {
        writes.push(request);
        saved = true;
        return Response.json(mutation);
      },
      () => Response.json(saved ? { ...state, permissions: [] } : state),
    ),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Edit physical rooms and beds'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await screen.findByText('Manager permission changes saved.');
  expect(await writes[0]?.json()).toEqual({ permissions: [] });
  await screen.findByText('0 additional permissions are currently configured.');
});
it('ACC-004: interrupted identical permission retries keep their command key and selected flags', async () => {
  const keys: (string | null)[] = [];
  setup(
    server(async (request) => {
      keys.push(request.headers.get('Idempotency-Key'));
      return problem('DEPENDENCY_UNAVAILABLE', 503);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Edit listing details and gallery'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await waitFor(() => expect(keys).toHaveLength(1));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save Manager permissions' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBeTruthy();
  expect(keys[1]).toBe(keys[0]);
  expect(screen.queryByText('Manager permission changes saved.')).toBeNull();
});
it('SEC-003: a mismatched response cannot display permission-save success', async () => {
  setup(server(async () => Response.json({ ...mutation, id: randomUUID() })));
  await edit();
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Manager permission changes saved.')).toBeNull();
  expect(screen.getByRole('button', { name: 'Save Manager permissions' })).toBeDefined();
});
it('ACC-004: concurrently changed read retains draft but requires explicit reload', async () => {
  let changed = false;
  const value = setup(
    server(undefined, () =>
      Response.json(changed ? { ...state, permissions: ['policy_edit'] } : state),
    ),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Edit listing details and gallery'));
  changed = true;
  await value.cache.invalidateQueries({
    queryKey: ['manager-grants', actorId, branchId, assignmentId],
  });
  await screen.findByText(/Saved permissions changed/);
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Save Manager permissions' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Reload current permissions' }));
  expect((screen.getByLabelText('Edit booking policies') as HTMLInputElement).checked).toBe(true);
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(false);
});
it('ACC-004: refresh outage retains a dirty permission draft while blocking writes', async () => {
  let failed = false;
  const value = setup(
    server(undefined, () =>
      failed ? problem('DEPENDENCY_UNAVAILABLE', 503) : Response.json(state),
    ),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Edit listing details and gallery'));
  failed = true;
  await value.cache.invalidateQueries({
    queryKey: ['manager-grants', actorId, branchId, assignmentId],
  });
  await screen.findByText(/Saved permissions could not refresh/);
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Save Manager permissions' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});
it('SEC-003: revoked Owner access hides cached assignment permissions and draft controls', async () => {
  let revoked = false;
  const value = setup(
    server(undefined, () => (revoked ? problem('BRANCH_FORBIDDEN', 403) : Response.json(state))),
  );
  await edit();
  revoked = true;
  await value.cache.invalidateQueries({
    queryKey: ['manager-grants', actorId, branchId, assignmentId],
  });
  await screen.findByRole('button', { name: 'Retry assignment access' });
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Save Manager permissions' })).toBeNull();
});
it('SEC-003: account and branch remounts discard previous private assignment selection', async () => {
  const value = setup(server());
  await edit();
  value.rerender(value.tree(randomUUID(), randomUUID()));
  expect(screen.queryByRole('checkbox')).toBeNull();
  expect(screen.getByRole('button', { name: 'Configure Manager permissions' })).toBeDefined();
});
it('ACC-004: cancelling discards checkbox changes without any write', async () => {
  const fetcher = server();
  setup(fetcher);
  await edit();
  fireEvent.click(screen.getByLabelText('Edit listing details and gallery'));
  fireEvent.click(screen.getByRole('button', { name: 'Cancel permission changes' }));
  expect(fetcher.mock.calls.every(([input, init]) => requestOf(input, init).method === 'GET')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit Manager permissions' }));
  expect(
    (screen.getByLabelText('Edit listing details and gallery') as HTMLInputElement).checked,
  ).toBe(false);
});
it('ACC-004: actual Manager cursor pagination retains prior names', async () => {
  const next = { ...manager, id: randomUUID(), fullName: 'Second Manager' },
    paths: URL[] = [];
  setup(
    vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = new URL(requestOf(input, init).url);
      paths.push(path);
      return Response.json(
        path.searchParams.has('cursor')
          ? { data: [next], nextCursor: null }
          : { data: [manager], nextCursor: next.id },
      );
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Configure Manager permissions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Load more Managers' }));
  await screen.findByRole('button', { name: 'Permissions for Second Manager (active)' });
  expect(
    screen.getByRole('button', { name: 'Permissions for Assigned Manager (active)' }),
  ).toBeDefined();
  expect(paths[1]?.searchParams.get('cursor')).toBe(next.id);
});
it('ACC-004: a failed initial assignment read never becomes a successful empty roster', async () => {
  setup(
    vi.fn<typeof fetch>().mockImplementation(async () => problem('DEPENDENCY_UNAVAILABLE', 503)),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Configure Manager permissions' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('No Managers have been assigned to this branch.')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Edit Manager permissions' })).toBeNull();
});

it('ACC-004: semantically identical checkbox retries preserve both canonical body and command key', async () => {
  const writes: { key: string | null; body: unknown }[] = [];
  setup(
    server(async (request) => {
      writes.push({ key: request.headers.get('Idempotency-Key'), body: await request.json() });
      return problem('DEPENDENCY_UNAVAILABLE', 503);
    }),
  );
  await edit();
  fireEvent.click(screen.getByLabelText('Edit listing details and gallery'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await waitFor(() => expect(writes).toHaveLength(1));
  await waitFor(() =>
    expect(
      (screen.getByRole('button', { name: 'Save Manager permissions' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false),
  );
  fireEvent.click(screen.getByLabelText('Edit physical rooms and beds'));
  fireEvent.click(screen.getByLabelText('Edit physical rooms and beds'));
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await waitFor(() => expect(writes).toHaveLength(2));
  expect(writes[1]).toEqual(writes[0]);
  expect(writes[0]?.body).toEqual({ permissions: ['inventory_edit', 'listing_edit'] });
});

it('ACC-004 / CHG-010: new financial/stay grants start unchecked and only explicit Owner selections are persisted', async () => {
  let saved = false;
  const writes: Request[] = [];
  const selected = ['finance_view', 'inventory_edit', 'payment_record'];
  setup(
    server(
      async (request) => {
        writes.push(request);
        saved = true;
        return Response.json(mutation);
      },
      () => Response.json(saved ? { ...state, permissions: selected } : state),
    ),
  );
  await edit();
  for (const label of [
    'Prepare, check in, transfer and extend stays',
    'Manage agreed rent and controlled charges (also requires Finance view)',
    'Record external hostel payments (also requires Finance view)',
    'View this branch’s financial records',
    'Complete checkouts; financial actions require their own permissions',
  ])
    expect((screen.getByLabelText(label) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByLabelText('View this branch’s financial records'));
  fireEvent.click(
    screen.getByLabelText('Record external hostel payments (also requires Finance view)'),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save Manager permissions' }));
  await screen.findByText('Manager permission changes saved.');
  expect(await writes[0]?.json()).toEqual({ permissions: selected });
});
