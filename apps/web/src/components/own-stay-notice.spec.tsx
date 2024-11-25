import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createApiClient, readCustomerStay } from '@hsm/api-client';

import { browserClient } from '../lib/client';
import { OwnStayNotice } from './own-stay-notice';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readCustomerStay: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: vi.fn() }));
const id = '10000000-0000-4000-8000-000000000001';
const other = '10000000-0000-4000-8000-000000000002';
const row: Awaited<ReturnType<typeof readCustomerStay>> = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Private resident',
  source: 'manual',
  state: 'active',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: '2028-02-01T06:00:00.000Z',
  closedAt: null,
  currentAssignment: null,
  bookingId: null,
  contact: { phone: null, email: null },
};
const result = {
  noticeId: other,
  stayId: id,
  state: 'notice_given',
  version: 2,
  plan: {
    submittedOn: '2028-02-26',
    requestedCheckoutDate: '2028-03-01',
    earliestCompliantCheckoutDate: '2028-03-12',
    requiredNoticeDays: 15,
    providedNoticeDays: 4,
    shortfallDays: 11,
    isEmergency: false,
    policyVersionId: other,
  },
};
let cache: QueryClient;
let transport: ReturnType<typeof vi.fn<typeof globalThis.fetch>>;
beforeEach(() => {
  vi.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  transport = vi
    .fn<typeof globalThis.fetch>()
    .mockImplementation(async () => Response.json(result, { status: 201 }));
  vi.mocked(browserClient).mockReturnValue(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: transport,
      authentication: { kind: 'cookie', csrf: () => 'csrf-fixture' },
    }),
  );
  vi.mocked(readCustomerStay).mockResolvedValue(row);
});
afterEach(() => {
  cleanup();
  cache.clear();
});
function fixture() {
  const props = { actorId: id, stayId: id, unavailable: false, onClose: vi.fn() };
  const tree = (next = props) => (
    <QueryClientProvider client={cache}>
      <OwnStayNotice {...next} />
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, props };
}
async function submit(reason?: string) {
  fireEvent.change(await screen.findByLabelText('Requested departure date'), {
    target: { value: '2028-03-01' },
  });
  if (reason)
    fireEvent.change(screen.getByLabelText('Departure reason'), { target: { value: reason } });
  fireEvent.click(screen.getByText('Submit departure notice'));
}
function request(index: number) {
  const value = transport.mock.calls.at(index)?.[0];
  if (!(value instanceof Request)) throw Error('Expected real SDK Request');
  return value;
}
it('OUT-001: sends the selected Stay, current version and deliberate date with cookie CSRF', async () => {
  const f = fixture();
  await submit();
  await screen.findByText('Departure notice recorded.');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(request(0).url).toBe('https://api.example.test/v1/me/stays/' + id + '/checkout-request');
  expect(request(0).headers.get('x-csrf-token')).toBe('csrf-fixture');
  expect(await request(0).json()).toEqual({
    expectedVersion: 1,
    requestedCheckoutDate: '2028-03-01',
    isEmergency: false,
  });
  await screen.findByText('Notice shortfall: 11 days');
  expect(
    screen.getByText('Giving notice does not check you out or release your accommodation.'),
  ).toBeDefined();
  expect(screen.queryByText('Paid')).toBeNull();
  expect(screen.queryByText('Submit departure notice')).toBeNull();
  fireEvent.click(screen.getByText('Close notice'));
  expect(f.props.onClose).toHaveBeenCalledOnce();
});
it('OUT-001: no automatic date or emergency reason; invalid input never reaches the API', async () => {
  fixture();
  await screen.findByLabelText('Requested departure date');
  fireEvent.submit(screen.getByRole('form', { name: 'Give departure notice' }));
  expect(await screen.findByRole('alert')).toBeDefined();
  expect(transport).not.toHaveBeenCalled();
  fireEvent.click(screen.getByLabelText('Emergency departure'));
  await submit();
  expect(transport).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Departure reason'), {
    target: { value: '  Emergency travel  ' },
  });
  transport.mockImplementation(async () =>
    Response.json({ ...result, plan: { ...result.plan, isEmergency: true } }, { status: 201 }),
  );
  fireEvent.click(screen.getByText('Submit departure notice'));
  await screen.findByText('Emergency: Yes');
  expect(await request(0).json()).toMatchObject({ isEmergency: true, reason: 'Emergency travel' });
});
it('ACC-004: unknown result survives revalidation to notice_given and retries exact body/key', async () => {
  transport.mockRejectedValueOnce(Error('lost response'));
  fixture();
  await submit('  Original travel  ');
  vi.mocked(readCustomerStay).mockResolvedValue({ ...row, state: 'notice_given', version: 2 });
  const retry = await screen.findByText('Retry original notice');
  await waitFor(() => expect((retry as HTMLButtonElement).disabled).toBe(false));
  expect(screen.queryByLabelText('Departure reason')).toBeNull();
  expect((screen.getByText('Close notice') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(retry);
  await screen.findByText('Departure notice recorded.');
  expect(request(1).headers.get('idempotency-key')).toBe(request(0).headers.get('idempotency-key'));
  expect(await request(1).json()).toEqual(await request(0).json());
});
it('SEC-003: revoked reads hide private timing; unavailable authority blocks retry and editing', async () => {
  const f = fixture();
  await submit();
  await screen.findByText('Notice shortfall: 11 days');
  vi.mocked(readCustomerStay).mockRejectedValue(Error('revoked private reason'));
  await cache.invalidateQueries({ queryKey: ['own-notice-authority'] });
  await screen.findByRole('alert');
  expect(screen.queryByLabelText('Recorded notice timing')).toBeNull();
  expect(screen.queryByText(/revoked private reason/)).toBeNull();
  f.rerender(f.tree({ ...f.props, unavailable: true }));
  expect((screen.getByText('Refresh notice access') as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByLabelText('Requested departure date')).toBeNull();
});
it('SEC-003: an unlinked or closed Stay never offers a new notice', async () => {
  vi.mocked(readCustomerStay).mockResolvedValue({ ...row, checkedInAt: null });
  fixture();
  await screen.findByText('Departure notice is available for an active, checked-in Stay.');
  expect(screen.queryByLabelText('Requested departure date')).toBeNull();
  expect(transport).not.toHaveBeenCalled();
});
it('SEC-003: actor change purges the prior actor private draft and retained command', async () => {
  const f = fixture();
  await submit('private reason');
  await screen.findByText('Departure notice recorded.');
  f.rerender(f.tree({ ...f.props, actorId: other }));
  await screen.findByLabelText('Requested departure date');
  expect(screen.queryByText('Departure notice recorded.')).toBeNull();
  expect((screen.getByLabelText('Departure reason') as HTMLTextAreaElement).value).toBe('');
});
it('ACC-004: invalidation failure does not turn a known server success into a second submission', async () => {
  vi.spyOn(cache, 'invalidateQueries').mockRejectedValueOnce(Error('refresh failed'));
  fixture();
  await submit();
  await screen.findByText('Notice recorded. Refresh your Stay to see the latest details.');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Retry original notice')).toBeNull();
});
