jest.mock('expo-router', () => ({
  useFocusEffect: (work: () => undefined | (() => void)) =>
    jest.requireActual<typeof import('react')>('react').useEffect(work, [work]),
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => false) },
}));
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBranchOccupancy } from '@hsm/api-client';
import { NativeBedBoard } from './bed-board';
import { pickDate } from '../test-utils/pick-date';
jest.mock('../lib/runtime', () => ({ client: {}, actorClient: async () => ({}) }));
jest.mock('@hsm/api-client', () => ({
  ...jest.requireActual('@hsm/api-client'),
  readBranchOccupancy: jest.fn(),
}));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roomId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const page = {
  branchId,
  on: '2026-10-26',
  totals: { beds: 2, occupied: 1, blocked: 1, reserved: 0, unavailable: 0, available: 0 },
  data: [
    {
      id: roomId,
      label: '101',
      roomTypeId: roomId,
      status: 'active',
      beds: [
        {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          label: 'A',
          ordinal: 1,
          status: 'active',
          state: 'occupied',
          occupant: { stayId: roomId, displayName: 'Resident One' },
        },
        {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          label: 'B',
          ordinal: 2,
          status: 'active',
          state: 'blocked',
          occupant: null,
        },
      ],
    },
  ],
  nextCursor: roomId,
};
async function view() {
  await render(
    <QueryClientProvider client={new QueryClient()}>
      <NativeBedBoard actorId="actor" branchId={branchId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => jest.clearAllMocks());
it('BED-001 / RES-004: reads server occupancy on open, pages and filters by date', async () => {
  jest.mocked(readBranchOccupancy).mockResolvedValue(page as never);
  await view();
  expect(readBranchOccupancy).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'View Bed Board' }));
  expect(await screen.findByText('Bed A: Occupied — Resident One')).toBeTruthy();
  expect(screen.getByText('Bed B: Blocked')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Next rooms' }));
  await waitFor(() =>
    expect(readBranchOccupancy).toHaveBeenLastCalledWith({}, branchId, {
      limit: 20,
      cursor: roomId,
    }),
  );
  await pickDate('Occupancy date', '2026-11-01');
  await fireEvent.press(screen.getByRole('button', { name: 'Show occupancy for date' }));
  await waitFor(() =>
    expect(readBranchOccupancy).toHaveBeenLastCalledWith({}, branchId, {
      limit: 20,
      on: '2026-11-01',
    }),
  );
});
it('SEC-003: failures show a safe message and the board can close', async () => {
  jest.mocked(readBranchOccupancy).mockRejectedValue(new Error('private failure detail'));
  await view();
  await fireEvent.press(screen.getByRole('button', { name: 'View Bed Board' }));
  await waitFor(() => expect(readBranchOccupancy).toHaveBeenCalled());
  expect(screen.queryByText(/private failure detail/)).toBeNull();
  await fireEvent.press(screen.getByRole('button', { name: 'Close occupancy by date' }));
  expect(screen.getByRole('button', { name: 'View Bed Board' })).toBeTruthy();
});
