/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { createApiClient, readCustomerStay } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import { OwnStayNotice } from './own-stay-notice';
import { pickDate } from '../test-utils/pick-date';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn() }));
jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => '10000000-0000-4000-8000-000000000003'),
}));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readCustomerStay: jest.fn(),
}));
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
let transport: jest.MockedFunction<typeof globalThis.fetch>;
beforeEach(() => {
  jest.clearAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  transport = jest.fn<ReturnType<typeof globalThis.fetch>, Parameters<typeof globalThis.fetch>>();
  transport.mockImplementation(
    async () =>
      new Response(JSON.stringify(result), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );
  jest.mocked(actorClient).mockResolvedValue(
    createApiClient({
      baseUrl: 'https://api.example.test',
      fetch: transport,
      authentication: { kind: 'bearer', accessToken: async () => 'fixture-token' },
    }),
  );
  jest.mocked(readCustomerStay).mockResolvedValue(row);
});
afterEach(() => cache.clear());
async function fixture() {
  const props = { actorId: id, stayId: id, unavailable: false, onClose: jest.fn() };
  const tree = (next = props) => (
    <QueryClientProvider client={cache}>
      <OwnStayNotice {...next} />
    </QueryClientProvider>
  );
  return { ...(await render(tree())), tree, props };
}
async function submit(reason?: string) {
  await pickDate('Requested departure date', '2028-03-01');
  if (reason) await fireEvent.changeText(screen.getByLabelText('Departure reason'), reason);
  await fireEvent.press(screen.getByRole('button', { name: 'Submit departure notice' }));
}
function request(index: number) {
  const value = transport.mock.calls.at(index)?.[0];
  if (!(value instanceof Request)) throw Error('Expected SDK Request');
  return value;
}
test('OUT-001: native current Stay notice sends exact terms and bearer authority; server timing is authoritative', async () => {
  const f = await fixture();
  await submit();
  await screen.findByText('Departure notice recorded.');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(request(0).headers.get('authorization')).toBe('Bearer fixture-token');
  expect(await request(0).json()).toEqual({
    expectedVersion: 1,
    requestedCheckoutDate: '2028-03-01',
    isEmergency: false,
  });
  await screen.findByText('Notice shortfall: 11 days');
  expect(screen.queryByText('Paid')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close notice' }));
  expect(f.props.onClose).toHaveBeenCalledTimes(1);
});
test('OUT-001: empty date and emergency without reason cannot submit', async () => {
  await fixture();
  await screen.findByRole('button', { name: /^Requested departure date:/ });
  await fireEvent.press(screen.getByRole('button', { name: 'Submit departure notice' }));
  await screen.findByText('Enter a valid departure date and a reason for an emergency departure.');
  await fireEvent(screen.getByLabelText('Emergency departure'), 'valueChange', true);
  await submit();
  expect(transport).not.toHaveBeenCalled();
  await fireEvent.changeText(screen.getByLabelText('Departure reason'), '  Emergency travel  ');
  transport.mockImplementation(
    async () =>
      new Response(JSON.stringify({ ...result, plan: { ...result.plan, isEmergency: true } }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Submit departure notice' }));
  await screen.findByText('Emergency: Yes');
  expect(await request(0).json()).toMatchObject({ isEmergency: true, reason: 'Emergency travel' });
});
test('ACC-004: native lost response retains original command through notice_given revalidation', async () => {
  transport.mockRejectedValueOnce(Error('Lost response'));
  jest
    .mocked(readCustomerStay)
    .mockResolvedValueOnce(row)
    .mockResolvedValue({ ...row, state: 'notice_given', version: 2 });
  const f = await fixture();
  await submit('  Original reason  ');
  const retry = await screen.findByRole('button', { name: 'Retry original notice' });
  await waitFor(() => expect(retry.props.accessibilityState.disabled).toBe(false));
  expect(screen.queryByLabelText('Departure reason')).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close notice' }));
  expect(f.props.onClose).not.toHaveBeenCalled();
  await fireEvent.press(retry);
  await screen.findByText('Departure notice recorded.');
  expect(request(1).headers.get('idempotency-key')).toBe(request(0).headers.get('idempotency-key'));
  expect(await request(1).json()).toEqual(await request(0).json());
});
test('SEC-003: native unavailable or revoked authority hides editing and private server timing', async () => {
  const f = await fixture();
  await submit();
  await screen.findByText('Notice shortfall: 11 days');
  await f.rerender(f.tree({ ...f.props, unavailable: true }));
  expect(screen.queryByLabelText('Recorded notice timing')).toBeNull();
  expect(screen.queryByRole('button', { name: /^Requested departure date:/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /^(Retry|Refresh)\b/ })).toBeNull();
});
test('SEC-003: native actor change clears completed result and private draft', async () => {
  const f = await fixture();
  await submit('Private reason');
  await screen.findByText('Departure notice recorded.');
  await f.rerender(f.tree({ ...f.props, actorId: other }));
  const input = await screen.findByLabelText('Departure reason');
  expect(input.props.value).toBe('');
  expect(screen.queryByText('Departure notice recorded.')).toBeNull();
});
