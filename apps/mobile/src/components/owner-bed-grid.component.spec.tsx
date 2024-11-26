/// <reference types="jest" />
import { fireEvent, render, screen } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { readBranchOccupancy } from '@hsm/api-client';
import { OwnerBedGrid } from './owner-bed-grid';
import type { FloorRooms } from './use-floor-rooms';
const mockDetail = jest.fn((props: unknown) => {
  void props;
  return null;
});
jest.mock('@hsm/api-client', () => ({ readBranchOccupancy: jest.fn() }));
jest.mock('../lib/runtime', () => ({ actorClient: jest.fn().mockResolvedValue({}) }));
jest.mock('./owner-media-gallery', () => ({ OwnerMediaGallery: () => null }));
jest.mock('./bed-detail', () => ({ NativeBedDetail: (props: unknown) => mockDetail(props) }));
jest.mock('expo-router', () => ({ router: {}, useFocusEffect: jest.fn() }));
const bed = { id: 'bed', label: 'A', ordinal: 1, archivedAt: null, status: 'active' as const };
const room = { id: 'room', label: '101', seats: [bed] } as FloorRooms['rooms'][number];
function fixture(canRead: boolean) {
  return {
    branchId: 'branch',
    inventory: { data: { permissions: canRead ? ['stay_manage'] : [] } },
    command: { isPending: false, unresolved: false },
  } as unknown as FloorRooms;
}
it('BED-001: server overdue status opens the exact bed with accessible state', async () => {
  jest.mocked(readBranchOccupancy).mockResolvedValue({
    branchId: 'branch',
    on: '2026-11-02',
    totals: { beds: 1, occupied: 1, available: 0, reserved: 0, blocked: 0, unavailable: 0 },
    nextCursor: null,
    data: [
      {
        id: 'room',
        label: '101',
        roomTypeId: 'type',
        status: 'active',
        beds: [
          {
            ...bed,
            state: 'occupied',
            rentStatus: 'overdue',
            occupant: { stayId: 'stay', displayName: 'Resident' },
          },
        ],
      },
    ],
  });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <OwnerBedGrid actorId="owner" data={fixture(true)} room={room} />
    </QueryClientProvider>,
  );
  await fireEvent.press(await screen.findByRole('button', { name: 'Bed A, Occupied, Overdue' }));
  expect(mockDetail).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: 'owner', branchId: 'branch', bedId: 'bed' }),
  );
  view.unmount();
  client.clear();
});
it('ACC-002: inventory access alone never loads or opens private occupancy', async () => {
  jest.mocked(readBranchOccupancy).mockClear();
  const add = jest.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = await render(
    <QueryClientProvider client={client}>
      <OwnerBedGrid actorId="manager" data={fixture(false)} room={room} add={add} />
    </QueryClientProvider>,
  );
  expect(screen.getByRole('button', { name: 'Bed A, active' })).toBeTruthy();
  expect(readBranchOccupancy).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByRole('button', { name: 'Add bed' }));
  expect(add).toHaveBeenCalledTimes(1);
  view.unmount();
  client.clear();
});
