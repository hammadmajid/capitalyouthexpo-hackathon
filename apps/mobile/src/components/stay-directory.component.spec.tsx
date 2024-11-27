jest.mock('expo-router', () => ({
  useFocusEffect: jest.fn(),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
/// <reference types="jest" />
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import {
  readInventoryAccess,
  readStaffStays,
  readStaffStay,
  readCustomerStays,
  readCustomerStay,
} from '@hsm/api-client';
import type { StayPage, StaySummary } from '@hsm/contracts';
import { StayDirectory } from './stay-directory';
import { pickDate } from '../test-utils/pick-date';
import { pullToRefresh } from '../test-utils/pull-refresh';
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn(async () => ({})) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual<typeof import('@hsm/api-client')>('@hsm/api-client'),
  readInventoryAccess: jest.fn(),
  readStaffStays: jest.fn(),
  readStaffStay: jest.fn(),
  readCustomerStays: jest.fn(),
  readCustomerStay: jest.fn(),
}));
const id = '10000000-0000-4000-8000-000000000001',
  next = '10000000-0000-4000-8000-000000000002';
const row: StaySummary = {
  id,
  branchId: id,
  residentId: id,
  displayName: 'Private Resident',
  source: 'manual',
  state: 'active',
  version: 1,
  moveInDate: '2028-02-01',
  expectedLeaveDate: null,
  checkedInAt: '2028-02-01T06:00:00.000Z',
  closedAt: null,
  currentAssignment: {
    id,
    roomTypeId: id,
    roomId: id,
    bedId: id,
    startedAt: '2028-02-01T06:00:00.000Z',
  },
};
let cache: QueryClient;
beforeEach(() => {
  jest.clearAllMocks();
  // Reset application stubs without erasing React Native's lazy native components.
  for (const read of [
    readInventoryAccess,
    readStaffStays,
    readStaffStay,
    readCustomerStays,
    readCustomerStay,
  ]) {
    jest.mocked(read).mockReset();
  }
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  jest
    .mocked(readInventoryAccess)
    .mockResolvedValue({ branchId: id, permissions: ['stay_manage'], canConfigureManagers: false });
  jest.mocked(readStaffStays).mockResolvedValue({ data: [row], nextCursor: null });
  jest.mocked(readCustomerStays).mockResolvedValue({ data: [row], nextCursor: null });
  jest.mocked(readStaffStay).mockResolvedValue({
    ...row,
    bookingId: null,
    contact: { phone: '+923001234567', email: 'resident@example.com' },
  });
  jest.mocked(readCustomerStay).mockResolvedValue({
    ...row,
    bookingId: null,
    checkedInAt: null,
    contact: { phone: null, email: null },
  });
  const runtime = jest.requireMock<{ actorClient: jest.Mock }>('../lib/runtime');
  runtime.actorClient.mockResolvedValue({});
});
afterEach(() => cache.clear());
function tree(props: { actorId?: string; branchId?: string; accessUnavailable?: boolean } = {}) {
  return (
    <QueryClientProvider client={cache}>
      <StayDirectory
        actorId={props.actorId ?? id}
        {...(props.branchId ? { branchId: props.branchId } : {})}
        {...(props.accessUnavailable === undefined
          ? {}
          : { accessUnavailable: props.accessUnavailable })}
      />
    </QueryClientProvider>
  );
}
async function open(staff = false) {
  await render(tree(staff ? { branchId: id } : {}));
  await fireEvent.press(
    await screen.findByRole('button', { name: staff ? 'Residents and stays' : 'My stays' }),
  );
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
}
test('RES-001 / SEC-003: native Customer Stay reads are lazy and contact data requires explicit selection', async () => {
  await render(tree());
  expect(readCustomerStays).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'My stays' }));
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
  expect(readCustomerStays).toHaveBeenCalledWith({}, { limit: 20 });
  expect(screen.queryByText(/Phone:/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  // A resident's own stay omits empty contact lines; staff views still label them.
  await screen.findByRole('button', { name: 'Back from stay details' });
  expect(screen.queryByText(/Phone:/)).toBeNull();
  expect(readCustomerStay).toHaveBeenCalledWith({}, id);
  await fireEvent.press(screen.getByRole('button', { name: 'Back from stay details' }));
  expect(screen.queryByText(/Phone:/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close stays' }));
  expect(screen.queryByText('Private Resident')).toBeNull();
});
test('RES-002: native staff page uses exact branch, bounded continuation and search/status resets', async () => {
  jest
    .mocked(readStaffStays)
    .mockResolvedValueOnce({ data: [row], nextCursor: next })
    .mockResolvedValue({ data: [], nextCursor: null });
  await open(true);
  await fireEvent.press(screen.getByRole('button', { name: 'Next stays' }));
  await screen.findByText('No stays match this view.');
  expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, cursor: next });
  await fireEvent.press(screen.getByRole('button', { name: 'First stays' }));
  await waitFor(() => expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20 }));
  await fireEvent.press(screen.getByRole('button', { name: 'Stay status: Ready' }));
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, state: 'check_in_ready' }),
  );
  await fireEvent.press(screen.getByRole('button', { name: 'Search Stay history' }));
  await fireEvent.changeText(screen.getByLabelText('Resident name'), ' Name ');
  await fireEvent.press(screen.getByRole('button', { name: 'Search residents' }));
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, id, {
      limit: 20,
      state: 'check_in_ready',
      q: 'Name',
    }),
  );
});
test('ACC-004: native detail binds exact branch and actual Stay without financial or document content', async () => {
  jest.mocked(readStaffStays).mockResolvedValue({
    data: [{ ...row, currentAssignment: null, expectedLeaveDate: '2028-03-01' }],
    nextCursor: null,
  });
  await open(true);
  expect(screen.getByText('No current occupancy assignment')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Email: resident@example.com');
  expect(readStaffStay).toHaveBeenCalledWith({}, id, id);
});
test('SEC-003: failed native background refresh hides cached names and retry restores only fresh results', async () => {
  await open(true);
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Email: resident@example.com');
  let rejectRead: (error: Error) => void = () => {
    throw new Error('Refresh was not started');
  };
  const pending = new Promise<StayPage>((_resolve, reject) => {
    rejectRead = reject;
  });
  jest.mocked(readStaffStays).mockReturnValueOnce(pending);
  let refresh: Promise<void> | undefined;
  await act(async () => {
    refresh = cache.invalidateQueries({ queryKey: ['private-stays'] });
  });
  await screen.findByLabelText('Loading stays…');
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(screen.queryByText(/Email:/)).toBeNull();
  expect(screen.queryByText(/Phone:/)).toBeNull();
  await act(async () => {
    rejectRead(new Error('Offline'));
    await refresh;
  });
  await screen.findByRole('alert');
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(screen.queryByText(/Email:/)).toBeNull();
  expect(screen.queryByText(/Phone:/)).toBeNull();
  await pullToRefresh(cache);
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
});
test('ACC-004: denied native detail hides old private list until a clean retry', async () => {
  await open(true);
  jest.mocked(readStaffStay).mockRejectedValueOnce(new Error('Permission removed'));
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Private Resident')).toBeNull();
  await pullToRefresh(cache);
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
  expect(screen.queryByText(/Phone:/)).toBeNull();
});
test('SEC-003: native actor/branch changes reset private state and parent access loss hides cached data', async () => {
  const view = await render(tree({ branchId: id }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Residents and stays' }));
  await screen.findByText('Private Resident');
  await view.rerender(tree({ branchId: id, accessUnavailable: true }));
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(screen.getByRole('alert')).toBeTruthy();
  await view.rerender(tree({ actorId: next, branchId: next }));
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(await screen.findByRole('button', { name: 'Residents and stays' })).toBeTruthy();
});

test('ACC-004: native module hides without stay permission and never reads residents', async () => {
  jest.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
  await render(tree({ branchId: id }));
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Residents and stays' })).toBeNull();
  expect(readStaffStays).not.toHaveBeenCalled();
});
test('ACC-004: native failed access check retries without showing private data', async () => {
  jest.mocked(readInventoryAccess).mockRejectedValueOnce(new Error('Access unavailable'));
  await render(tree({ branchId: id }));
  await screen.findAllByRole('alert');
  await pullToRefresh(cache);
  await screen.findByRole('button', { name: 'Residents and stays' });
  expect(readStaffStays).not.toHaveBeenCalled();
});

test('OUT-001 / ACC-004: native own Stay opens a notice outside the refreshing directory', async () => {
  const detail = { ...row, bookingId: null, contact: { phone: null, email: null } };
  let resolveAuthority: () => void = () => {
    throw Error('Authority fixture not initialized');
  };
  const authority = new Promise<typeof detail>((resolve) => {
    resolveAuthority = () => resolve(detail);
  });
  jest
    .mocked(readCustomerStay)
    .mockResolvedValue(detail)
    .mockResolvedValueOnce(detail)
    .mockReturnValueOnce(authority);
  await open();
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await fireEvent.press(await screen.findByRole('button', { name: 'Give departure notice' }));
  expect(screen.queryByRole('button', { name: /^Requested departure date:/ })).toBeNull();
  await act(async () => {
    resolveAuthority();
    await authority;
  });
  await pickDate('Requested departure date', '2028-03-01');
  await fireEvent.changeText(screen.getByLabelText('Departure reason'), 'Keep original draft');
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['private-stays', id, 'own'] });
  });
  expect(screen.getByRole('button', { name: 'Requested departure date: 1 Mar 2028' })).toBeTruthy();
  expect(screen.getByLabelText('Departure reason').props.value).toBe('Keep original draft');
  await fireEvent.press(screen.getByRole('button', { name: 'Close notice' }));
  expect(screen.queryByLabelText('Departure reason')).toBeNull();
});
test('SEC-003 / OUT-001: native staff Stay detail never offers a Customer notice', async () => {
  await open(true);
  await fireEvent.press(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Phone: +923001234567');
  expect(screen.queryByRole('button', { name: 'Give departure notice' })).toBeNull();
});
