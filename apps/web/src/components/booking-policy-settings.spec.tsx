import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BookingPolicySettings } from './booking-policy-settings';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const rootVersionId = randomUUID();
const actorId = randomUUID(),
  branchId = randomUUID();
const target = { level: 'branch' as const, id: branchId };
const policy = {
  bookingMode: 'request',
  holdSeconds: 600,
  requestExpirySeconds: 3600,
  requestReservesInventory: true,
  minimumStayDays: 1,
  maximumStayDays: 365,
  minimumAdvanceDays: 0,
  maximumAdvanceDays: 90,
  customerSelectsInventory: true,
  cancellationAllowed: true,
  cancellationCutoffHours: 24,
  allowedStayUnits: ['day'],
  allowEvidenceReuse: true,
  documentReviewRequired: false,
  requiredDocuments: [],
};
const limits = {
  maximumHoldSeconds: 3600,
  maximumActiveHolds: 3,
  maximumRequestExpirySeconds: 86400,
  maximumAdvanceDays: 365,
  maximumFiniteStayDays: 730,
};
const settings = {
  configured: true,
  target: { level: 'branch', scopeId: branchId },
  canEdit: true,
  localVersion: null,
  overrides: null,
  inherited: policy,
  effective: policy,
  limits,
  lineage: [{ id: rootVersionId, level: 'platform', scopeId: null }],
};
function setup(fetcher: typeof fetch) {
  vi.stubGlobal('fetch', fetcher);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const tree = (actor = actorId) => (
    <QueryClientProvider client={cache}>
      <BookingPolicySettings actorId={actor} target={target} />
    </QueryClientProvider>
  );
  const view = render(tree());
  return { cache, ...view, tree };
}
const open = () => fireEvent.click(screen.getByRole('button', { name: 'View booking policy' }));
it('BKG-006: settings are lazy, display returned effective values and hide raw lineage IDs', async () => {
  const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(settings));
  setup(transport);
  expect(transport).not.toHaveBeenCalled();
  open();
  expect(await screen.findByText('Effective policy and inherited parent values')).toBeDefined();
  expect(screen.getAllByText('600')).toHaveLength(2);
  expect(document.body.textContent).not.toContain(rootVersionId);
});
it('ACC-004: server permission denial renders read-only settings', async () => {
  setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json({ ...settings, canEdit: false })));
  open();
  expect(await screen.findByText('You have read-only access to these settings.')).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit booking policy' })).toBeNull();
});
it('BKG-006: absent platform configuration cannot produce a branch override form', async () => {
  setup(
    vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        Response.json({ configured: false, target: settings.target, canEdit: true }),
      ),
  );
  open();
  expect(await screen.findByText(/A Root administrator must configure them first/)).toBeDefined();
  expect(screen.queryByRole('button', { name: 'Edit booking policy' })).toBeNull();
});
it('ACC-004: account changes discard the previous policy editor and cache scope', async () => {
  const value = setup(vi.fn<typeof fetch>().mockResolvedValue(Response.json(settings)));
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  fireEvent.change(screen.getByLabelText('Hold duration (seconds)'), { target: { value: '900' } });
  value.rerender(value.tree(randomUUID()));
  expect(screen.queryByLabelText('Hold duration (seconds)')).toBeNull();
  expect(screen.getByRole('button', { name: 'View booking policy' })).toBeDefined();
});
it.each([
  ['BRANCH_FORBIDDEN', 403],
  ['NOT_FOUND', 404],
] as const)('SEC-003: %s hides cached settings and privileged forms', async (code, status) => {
  let revoked = false;
  const value = setup(async () =>
    revoked
      ? Response.json(
          {
            type: 'https://example.test/problems/forbidden',
            title: 'Forbidden',
            status,
            code,
            detail: 'Unavailable',
            traceId: 'trace',
          },
          { status },
        )
      : Response.json(settings),
  );
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  revoked = true;
  await value.cache.invalidateQueries({ queryKey: ['booking-policy'] });
  await waitFor(() => expect(screen.queryByLabelText('Hold duration (seconds)')).toBeNull());
  expect(screen.queryByText('Effective policy and inherited parent values')).toBeNull();
  expect(screen.getByRole('button', { name: 'Retry policy access' })).toBeDefined();
});
it('ACC-004: permission refresh outage preserves entered policy but disables saving', async () => {
  let offline = false;
  const value = setup(async () => {
    if (offline) throw new Error('Private provider detail');
    return Response.json(settings);
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  fireEvent.change(screen.getByLabelText('Hold duration (seconds)'), { target: { value: '900' } });
  offline = true;
  await value.cache.invalidateQueries({ queryKey: ['booking-policy'] });
  await screen.findByRole('button', { name: 'Refresh policy access' });
  expect((screen.getByLabelText('Hold duration (seconds)') as HTMLInputElement).value).toBe('900');
  expect(
    (screen.getByLabelText('Hold duration (seconds)').closest('fieldset') as HTMLFieldSetElement)
      .disabled,
  ).toBe(true);
  expect(document.body.textContent).not.toContain('Private provider detail');
});

it('BKG-006: save waits for persisted response and displays refreshed server settings', async () => {
  let complete: ((value: Response) => void) | undefined,
    saved = false;
  let refresh: ((value: Response) => void) | undefined;
  const requests: Request[] = [];
  setup(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    requests.push(request);
    if (request.method === 'PUT')
      return new Promise<Response>((resolve) => {
        complete = resolve;
      });
    if (saved)
      return new Promise<Response>((resolve) => {
        refresh = resolve;
      });
    return Response.json(settings);
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  fireEvent.change(screen.getByLabelText('Hold duration (seconds)'), { target: { value: '900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(await screen.findByRole('button', { name: 'Saving policy…' })).toBeDefined();
  expect(
    screen.queryByText('Booking policy saved. Current server values appear below.'),
  ).toBeNull();
  await waitFor(() => expect(complete).toBeDefined());
  saved = true;
  complete?.(Response.json({ id: randomUUID(), level: 'branch', scopeId: branchId }));
  expect(await screen.findByText('Booking policy saved. Refreshing server values…')).toBeDefined();
  expect(
    (screen.getByRole('button', { name: 'Edit booking policy' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await waitFor(() => expect(refresh).toBeDefined());
  refresh?.(Response.json({ ...settings, effective: { ...policy, holdSeconds: 900 } }));
  expect(
    await screen.findByText('Booking policy saved. Current server values appear below.'),
  ).toBeDefined();
  expect(await screen.findByText('900')).toBeDefined();
  expect(requests.filter((request) => request.method === 'PUT')).toHaveLength(1);
});
it('BKG-006: failed identical policy retries retain the original command key', async () => {
  const keys: (string | null)[] = [];
  setup(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method === 'PUT') {
      keys.push(request.headers.get('Idempotency-Key'));
      throw new Error('Private transport detail');
    }
    return Response.json(settings);
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  fireEvent.change(screen.getByLabelText('Hold duration (seconds)'), { target: { value: '900' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[0]).toBeTruthy();
  expect(keys[0]).toBe(keys[1]);
  expect(document.body.textContent).not.toContain('Private transport detail');
});

it('SEC-003: malformed denial responses keep settings writes disabled without exposing provider details', async () => {
  let malformed = false,
    writes = 0;
  const value = setup(async (input, init) => {
    const request = input instanceof Request ? input : new Request(input, init);
    if (request.method === 'PUT') writes += 1;
    return malformed
      ? Response.json(
          {
            type: 'https://example.test/problems/forbidden',
            title: 'Private provider detail',
            status: 403,
            code: 'BRANCH_FORBIDDEN',
            traceId: 'trace',
          },
          { status: 403 },
        )
      : Response.json(settings);
  });
  open();
  fireEvent.click(await screen.findByRole('button', { name: 'Edit booking policy' }));
  malformed = true;
  await value.cache.invalidateQueries({ queryKey: ['booking-policy'] });
  await screen.findByRole('button', { name: 'Refresh policy access' });
  expect(screen.getByRole('button', { name: 'Save booking policy' }).matches(':disabled')).toBe(
    true,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save booking policy' }));
  expect(writes).toBe(0);
  expect(document.body.textContent).not.toContain('Private provider detail');
});
