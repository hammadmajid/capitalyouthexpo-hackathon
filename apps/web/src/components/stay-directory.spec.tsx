import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  readInventoryAccess,
  readStaffStays,
  readStaffStay,
  readCustomerStays,
  readCustomerStay,
} from '@hsm/api-client';
import type { StayPage, StaySummary } from '@hsm/contracts';
import { StayDirectory } from './stay-directory';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  readInventoryAccess: vi.fn(),
  readStaffStays: vi.fn(),
  readStaffStay: vi.fn(),
  readCustomerStays: vi.fn(),
  readCustomerStay: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
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
  vi.resetAllMocks();
  cache = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['stay_manage'],
    canConfigureManagers: false,
  });
  vi.mocked(readStaffStays).mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(readCustomerStays).mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(readStaffStay).mockResolvedValue({
    ...row,
    bookingId: null,
    contact: { phone: '+923001234567', email: 'resident@example.com' },
  });
  vi.mocked(readCustomerStay).mockResolvedValue({
    ...row,
    bookingId: null,
    checkedInAt: null,
    contact: { phone: null, email: null },
  });
});
afterEach(() => {
  cleanup();
  cache.clear();
});
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
  render(tree(staff ? { branchId: id } : {}));
  fireEvent.click(
    await screen.findByRole('button', { name: staff ? 'Residents and stays' : 'My stays' }),
  );
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
}
it('RES-001 / SEC-003: Customer private reads are lazy and contact details require explicit selection', async () => {
  render(tree());
  expect(readCustomerStays).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'My stays' }));
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
  expect(readCustomerStays).toHaveBeenCalledWith({}, { limit: 20 });
  expect(screen.queryByText(/Phone:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Phone: Not provided');
  expect(readCustomerStay).toHaveBeenCalledWith({}, id);
  expect(screen.getByText('Checked in: Not checked in')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close stay details' }));
  expect(screen.queryByText(/Phone:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close stays' }));
  expect(screen.queryByText('Private Resident')).toBeNull();
});
it('RES-002: staff search/status and keyset navigation bind the branch and reset selections', async () => {
  vi.mocked(readStaffStays)
    .mockResolvedValueOnce({ data: [row], nextCursor: next })
    .mockResolvedValue({ data: [], nextCursor: null });
  await open(true);
  fireEvent.click(screen.getByRole('button', { name: 'Next stays' }));
  await screen.findByText('No stays match this view.');
  expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, cursor: next });
  fireEvent.click(screen.getByRole('button', { name: 'First stays' }));
  await waitFor(() => expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20 }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Stay status' }), {
    target: { value: 'completed' },
  });
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, state: 'completed' }),
  );
  fireEvent.change(screen.getByRole('textbox', { name: 'Resident name' }), {
    target: { value: ' Name ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Search residents' }));
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, id, {
      limit: 20,
      state: 'completed',
      q: 'Name',
    }),
  );
  fireEvent.change(screen.getByRole('combobox', { name: 'Stay status' }), {
    target: { value: '' },
  });
  await waitFor(() =>
    expect(readStaffStays).toHaveBeenLastCalledWith({}, id, { limit: 20, q: 'Name' }),
  );
});
it('ACC-004: staff detail uses exact branch/Stay, including non-occupied and planned-date states', async () => {
  vi.mocked(readStaffStays).mockResolvedValue({
    data: [{ ...row, expectedLeaveDate: '2028-03-01', currentAssignment: null }],
    nextCursor: null,
  });
  await open(true);
  expect(screen.getByText('No current occupancy assignment')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Email: resident@example.com');
  expect(readStaffStay).toHaveBeenCalledWith({}, id, id);
});
it('SEC-003: a failed background refresh hides old names and contacts until fresh access succeeds', async () => {
  await open(true);
  fireEvent.click(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByText('Email: resident@example.com');
  let rejectRead: (error: Error) => void = () => {
    throw new Error('Refresh was not started');
  };
  const pending = new Promise<StayPage>((_resolve, reject) => {
    rejectRead = reject;
  });
  vi.mocked(readStaffStays).mockReturnValueOnce(pending);
  let refresh: Promise<void> | undefined;
  await act(async () => {
    refresh = cache.invalidateQueries({ queryKey: ['private-stays'] });
  });
  await screen.findByText('Loading stays…');
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
  fireEvent.click(screen.getByRole('button', { name: 'Retry stays' }));
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
});
it('ACC-004: denied detail hides the entire stale private list and retry clears the selection', async () => {
  await open(true);
  vi.mocked(readStaffStay).mockRejectedValueOnce(new Error('Permission removed'));
  fireEvent.click(screen.getByRole('button', { name: 'View stay for Private Resident' }));
  await screen.findByRole('alert');
  expect(screen.queryByText('Private Resident')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry stays' }));
  await screen.findByRole('button', { name: 'View stay for Private Resident' });
  expect(screen.queryByText(/Phone:/)).toBeNull();
});
it('SEC-003: actor/branch changes remount and clear private data; parent access loss hides existing data', async () => {
  const view = render(tree({ branchId: id }));
  fireEvent.click(await screen.findByRole('button', { name: 'Residents and stays' }));
  await screen.findByText('Private Resident');
  view.rerender(tree({ branchId: id, accessUnavailable: true }));
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(screen.getByRole('alert')).not.toBeNull();
  view.rerender(tree({ actorId: next, branchId: next }));
  expect(screen.queryByText('Private Resident')).toBeNull();
  expect(await screen.findByRole('button', { name: 'Residents and stays' })).not.toBeNull();
});

it('ACC-004: absent stay permission hides staff module and never requests resident data', async () => {
  vi.mocked(readInventoryAccess).mockResolvedValue({
    branchId: id,
    permissions: ['booking_manage'],
    canConfigureManagers: false,
  });
  render(tree({ branchId: id }));
  await waitFor(() => expect(readInventoryAccess).toHaveBeenCalled());
  expect(screen.queryByRole('button', { name: 'Residents and stays' })).toBeNull();
  expect(readStaffStays).not.toHaveBeenCalled();
});
it('ACC-004: failed access verification can retry without revealing cached resident data', async () => {
  vi.mocked(readInventoryAccess).mockRejectedValueOnce(new Error('Access unavailable'));
  render(tree({ branchId: id }));
  await screen.findByRole('button', { name: 'Retry Stay access' });
  fireEvent.click(screen.getByRole('button', { name: 'Retry Stay access' }));
  await screen.findByRole('button', { name: 'Residents and stays' });
  expect(readStaffStays).not.toHaveBeenCalled();
});

it('OUT-001 / ACC-004: actual own Stay opens notice and retains its draft through directory revalidation', async () => {
  vi.mocked(readCustomerStay).mockResolvedValue({
    ...row,
    bookingId: null,
    contact: { phone: null, email: null },
  });
  await open();
  fireEvent.click(screen.getByText('View stay for Private Resident'));
  fireEvent.click(await screen.findByText('Give departure notice'));
  fireEvent.change(await screen.findByLabelText('Requested departure date'), {
    target: { value: '2028-03-01' },
  });
  fireEvent.change(screen.getByLabelText('Departure reason'), {
    target: { value: 'Keep original draft' },
  });
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ['private-stays', id, 'own'] });
  });
  expect((screen.getByLabelText('Requested departure date') as HTMLInputElement).value).toBe(
    '2028-03-01',
  );
  expect((screen.getByLabelText('Departure reason') as HTMLTextAreaElement).value).toBe(
    'Keep original draft',
  );
  expect(screen.getByText('Close stays').matches(':disabled')).toBe(true);
  fireEvent.click(screen.getByText('Close notice'));
  expect(screen.queryByLabelText('Departure reason')).toBeNull();
});
it('SEC-003 / OUT-001: staff Stay detail never exposes the Customer own-notice action', async () => {
  await open(true);
  fireEvent.click(screen.getByText('View stay for Private Resident'));
  await screen.findByText('Phone: +923001234567');
  expect(screen.queryByText('Give departure notice')).toBeNull();
});
