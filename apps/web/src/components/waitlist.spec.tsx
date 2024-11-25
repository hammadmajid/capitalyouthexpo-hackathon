import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  ClientFailure,
  executeWaitlistCommand,
  listOwnWaitlist,
  listBranchWaitlist,
  listPublicInventoryRoomTypes,
  readPublicWaitlistOpen,
} from '@hsm/api-client';
import { Waitlist } from './waitlist';
import { WaitlistJoin } from './waitlist-join';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  executeWaitlistCommand: vi.fn(),
  listOwnWaitlist: vi.fn(),
  listBranchWaitlist: vi.fn(),
  listPublicInventoryRoomTypes: vi.fn(),
  readPublicWaitlistOpen: vi.fn(),
}));
vi.mock('../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('./providers', () => ({
  useSession: () => ({
    data: { user: { id: actorId }, capabilities: { customer: true } },
    isPending: false,
    error: null,
  }),
}));
const actorId = '10000000-0000-4000-8000-000000000001',
  branchId = '10000000-0000-4000-8000-000000000002';
const row = {
  id: '10000000-0000-4000-8000-000000000003',
  branchId,
  branchName: 'Actual Hostel',
  roomTypeId: null,
  roomTypeName: null,
  expectedVacancyDate: null,
  joinedAt: '2026-10-24T03:00:00.000Z',
  leftAt: null,
};
function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  const rendered = render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return { client, ...rendered };
}
afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(executeWaitlistCommand).mockReset().mockResolvedValue(row);
  vi.mocked(listOwnWaitlist)
    .mockReset()
    .mockResolvedValue({ data: [row], nextCursor: null });
  vi.mocked(listBranchWaitlist)
    .mockReset()
    .mockResolvedValue({ data: [{ ...row, customerName: 'Customer' }], nextCursor: null });
  vi.mocked(readPublicWaitlistOpen).mockReset().mockResolvedValue({ open: true, roomTypeIds: [] });
});
it('WAIT-001 / SEC-003: private entries load lazily and revalidation failures hide cached facts', async () => {
  const { client } = mount(<Waitlist actorId={actorId} />);
  expect(listOwnWaitlist).not.toHaveBeenCalled();
  fireEvent.click(screen.getByText('My waiting list'));
  await screen.findByText('Actual Hostel — Any room type');
  vi.mocked(listOwnWaitlist).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['waitlist', actorId] });
  });
  await screen.findByText('Refresh waiting list');
  expect(screen.queryByText('Actual Hostel — Any room type')).toBeNull();
});
it('WAIT-001: uncertain leave retains the command/key through list refresh and retries exactly once', async () => {
  vi.mocked(executeWaitlistCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({ ...row, leftAt: row.joinedAt });
  const { client } = mount(<Waitlist actorId={actorId} />);
  fireEvent.click(screen.getByText('My waiting list'));
  fireEvent.click(await screen.findByText('Leave waiting list'));
  await screen.findByText('Retry original leave request');
  const original = vi.mocked(executeWaitlistCommand).mock.calls[0];
  await act(async () => {
    await client.refetchQueries({ queryKey: ['waitlist', actorId] });
  });
  fireEvent.click(screen.getByText('Retry original leave request'));
  await waitFor(() => expect(executeWaitlistCommand).toHaveBeenCalledTimes(2));
  expect(vi.mocked(executeWaitlistCommand).mock.calls[1]).toEqual(original);
});
it('WAIT-001 / ACC-002: branch scope lists names and hides all facts when access is unavailable', async () => {
  const { rerender } = mount(<Waitlist actorId={actorId} branchId={branchId} />);
  fireEvent.click(screen.getByText('Manage waiting list'));
  await screen.findByText('Customer');
  expect(listOwnWaitlist).not.toHaveBeenCalled();
  expect(listBranchWaitlist).toHaveBeenCalledWith(expect.anything(), branchId, {});
  rerender(
    <QueryClientProvider client={new QueryClient()}>
      <Waitlist actorId={actorId} branchId={branchId} accessUnavailable />
    </QueryClientProvider>,
  );
  expect(screen.queryByText('Customer')).toBeNull();
});
it('WAIT-001: join discloses non-reservation semantics and retains the exact original request after uncertainty', async () => {
  vi.mocked(executeWaitlistCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce(row);
  mount(<WaitlistJoin branchId={branchId} />);
  expect(await screen.findByText(/do not reserve a bed/)).toBeTruthy();
  fireEvent.click(screen.getByText('Join waiting list'));
  fireEvent.click(await screen.findByText('Retry waiting-list request'));
  await screen.findByText(/You are on this waiting list/);
  const calls = vi.mocked(executeWaitlistCommand).mock.calls;
  expect(calls).toHaveLength(2);
  expect(calls[0]).toEqual(calls[1]);
  expect(calls[0]?.[1]).toEqual({ kind: 'join', body: { branchId } });
});
it('WAIT-001: actual named room-type preference stays fixed after uncertainty', async () => {
  const roomTypeId = '10000000-0000-4000-8000-000000000005';
  vi.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
    branchId,
    data: [
      {
        id: roomTypeId,
        name: 'Two beds',
        capacity: 2,
        inventoryMode: 'both',
        bedMonthlyRentPaisa: 1800000,
        roomMonthlyRentPaisa: 3200000,
        depositPaisa: 0,
        fees: [],
        amenities: [],
      },
    ],
    nextCursor: null,
  });
  vi.mocked(executeWaitlistCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({ ...row, roomTypeId, roomTypeName: 'Two beds' });
  mount(<WaitlistJoin branchId={branchId} />);
  fireEvent.click(await screen.findByText('Choose waiting-list room type'));
  fireEvent.click(await screen.findByText('Two beds: join preference'));
  fireEvent.click(screen.getByText('Join waiting list'));
  await screen.findByText('Retry waiting-list request');
  expect((screen.getByText('Any room type') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByText('Retry waiting-list request'));
  await screen.findByText(/You are on this waiting list/);
  const calls = vi.mocked(executeWaitlistCommand).mock.calls;
  expect(calls[0]?.[1]).toEqual({ kind: 'join', body: { branchId, roomTypeId } });
  expect(calls[0]).toEqual(calls[1]);
});
it('CHG-040: the waiting list is offered only once a resident has given notice', async () => {
  vi.mocked(readPublicWaitlistOpen).mockResolvedValue({ open: false, roomTypeIds: [] });
  mount(<WaitlistJoin branchId={branchId} />);
  await waitFor(() => expect(readPublicWaitlistOpen).toHaveBeenCalledWith({}, branchId));
  expect(screen.queryByRole('button', { name: 'Join waiting list' })).toBeNull();
  cleanup();
  const typeId = '10000000-0000-4000-8000-000000000009';
  vi.mocked(readPublicWaitlistOpen).mockResolvedValue({ open: true, roomTypeIds: [typeId] });
  mount(<WaitlistJoin branchId={branchId} roomTypeId={branchId} />);
  await waitFor(() => expect(readPublicWaitlistOpen).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole('button', { name: 'Join waiting list' })).toBeNull();
  cleanup();
  mount(<WaitlistJoin branchId={branchId} roomTypeId={typeId} />);
  expect(await screen.findByRole('button', { name: 'Join waiting list' })).toBeTruthy();
});
