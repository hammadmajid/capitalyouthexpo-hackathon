import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
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
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  executeWaitlistCommand: jest.fn(),
  listOwnWaitlist: jest.fn(),
  listBranchWaitlist: jest.fn(),
  listPublicInventoryRoomTypes: jest.fn(),
  readPublicWaitlistOpen: jest.fn(),
}));
jest.mock('expo-crypto', () => ({ randomUUID: () => '10000000-0000-4000-8000-000000000004' }));
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
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
const caches: QueryClient[] = [];
async function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false, gcTime: 0 },
    },
  });
  caches.push(client);
  await render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
afterEach(async () => {
  await cleanup();
  for (const client of caches.splice(0)) client.clear();
});
beforeEach(() => {
  jest.clearAllMocks();
  // A resident on the fixture room type has given notice, so the list is open.
  jest
    .mocked(readPublicWaitlistOpen)
    .mockResolvedValue({ open: true, roomTypeIds: ['10000000-0000-4000-8000-000000000005'] });
  jest.mocked(executeWaitlistCommand).mockReset().mockResolvedValue(row);
  jest
    .mocked(listOwnWaitlist)
    .mockReset()
    .mockResolvedValue({ data: [row], nextCursor: null });
  jest
    .mocked(listBranchWaitlist)
    .mockReset()
    .mockResolvedValue({ data: [{ ...row, customerName: 'Customer' }], nextCursor: null });
});
it('WAIT-001 / SEC-003: native private data is lazy and disappears after failed revalidation', async () => {
  const client = await mount(<Waitlist actorId={actorId} />);
  expect(listOwnWaitlist).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByText('My waiting list'));
  await screen.findByText('Actual Hostel — Any room type');
  jest.mocked(listOwnWaitlist).mockRejectedValue(new ClientFailure('NETWORK_UNAVAILABLE'));
  await act(async () => {
    await client.refetchQueries({ queryKey: ['waitlist', actorId] });
  });
  await screen.findAllByRole('alert');
  expect(screen.queryByText('Actual Hostel — Any room type')).toBeNull();
});
it('WAIT-001: native uncertain leave survives refresh with its original command/key', async () => {
  jest
    .mocked(executeWaitlistCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({ ...row, leftAt: row.joinedAt });
  const client = await mount(<Waitlist actorId={actorId} />);
  await fireEvent.press(screen.getByText('My waiting list'));
  await fireEvent.press(await screen.findByText('Leave waiting list'));
  await fireEvent.press(await screen.findByText('Yes, leave'));
  await screen.findByText('Retry original leave request');
  const original = jest.mocked(executeWaitlistCommand).mock.calls[0];
  await act(async () => {
    await client.refetchQueries({ queryKey: ['waitlist', actorId] });
  });
  await fireEvent.press(screen.getByText('Retry original leave request'));
  await waitFor(() => expect(executeWaitlistCommand).toHaveBeenCalledTimes(2));
  expect(jest.mocked(executeWaitlistCommand).mock.calls[1]).toEqual(original);
});
it('WAIT-001: native guest sign-in and confirmed join use real command semantics', async () => {
  const signIn = jest.fn();
  await mount(<WaitlistJoin branchId={branchId} signIn={signIn} />);
  await fireEvent.press(await screen.findByText('Sign in to join the waiting list'));
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(executeWaitlistCommand).not.toHaveBeenCalled();
  await cleanup();
  await mount(<WaitlistJoin branchId={branchId} actorId={actorId} signIn={signIn} />);
  await fireEvent.press(await screen.findByText('Join waiting list'));
  await screen.findByText(/You are on this waiting list/);
  expect(jest.mocked(executeWaitlistCommand).mock.calls[0]?.[1]).toEqual({
    kind: 'join',
    body: { branchId },
  });
});
it('WAIT-001: native named room-type selection retains original intent after uncertainty', async () => {
  const roomTypeId = '10000000-0000-4000-8000-000000000005';
  jest.mocked(listPublicInventoryRoomTypes).mockResolvedValue({
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
  jest
    .mocked(executeWaitlistCommand)
    .mockRejectedValueOnce(new ClientFailure('NETWORK_UNAVAILABLE'))
    .mockResolvedValueOnce({ ...row, roomTypeId, roomTypeName: 'Two beds' });
  await mount(<WaitlistJoin actorId={actorId} branchId={branchId} signIn={() => undefined} />);
  await fireEvent.press(await screen.findByText('Choose waiting-list room type'));
  await fireEvent.press(await screen.findByText('Two beds: join preference'));
  await fireEvent.press(screen.getByText('Join waiting list'));
  await screen.findByText('Retry waiting-list request');
  await fireEvent.press(screen.getByText('Retry waiting-list request'));
  await screen.findByText(/You are on this waiting list/);
  const calls = jest.mocked(executeWaitlistCommand).mock.calls;
  expect(calls[0]?.[1]).toEqual({ kind: 'join', body: { branchId, roomTypeId } });
  expect(calls[0]).toEqual(calls[1]);
});

it('CHG-040: no waiting-list option until a resident has given notice', async () => {
  jest.mocked(readPublicWaitlistOpen).mockResolvedValue({ open: false, roomTypeIds: [] });
  await mount(<WaitlistJoin branchId={branchId} actorId={actorId} signIn={() => undefined} />);
  await waitFor(() => expect(readPublicWaitlistOpen).toHaveBeenCalled());
  expect(screen.queryByText('Join waiting list')).toBeNull();
  expect(screen.queryByText('Sign in to join the waiting list')).toBeNull();
});
