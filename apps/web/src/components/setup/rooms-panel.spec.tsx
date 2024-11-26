import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  archiveInventory,
  attachListingImage,
  createInventoryBed,
  createSetupRoom,
  readBranchInventory,
  readBranchOccupancy,
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
} from '@hsm/api-client';
import { RoomsPanel } from './rooms-panel';
vi.mock('@hsm/api-client', async (original) => ({
  ...(await original<typeof import('@hsm/api-client')>()),
  archiveInventory: vi.fn(),
  attachListingImage: vi.fn(),
  createInventoryBed: vi.fn(),
  createSetupRoom: vi.fn(),
  readBranchInventory: vi.fn(),
  readBranchOccupancy: vi.fn(),
  readPropertyBuildings: vi.fn(),
  readPropertyFloors: vi.fn(),
  readPropertyRoomLocation: vi.fn(),
}));
vi.mock('../../lib/client', () => ({ browserClient: () => ({}) }));
vi.mock('../amenities/room-amenities', () => ({ RoomAmenities: () => <p>Room amenities</p> }));
vi.mock('../private-file-input', () => ({
  PrivateFileInput: ({ label, onReady }: { label: string; onReady: (id: string) => void }) => (
    <button type="button" onClick={() => onReady('99999999-9999-4999-8999-999999999999')}>
      {'Attach ' + label}
    </button>
  ),
}));
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const branchId = id(1),
  building = { id: id(2), name: 'Block B', version: 1 },
  floor = { id: id(3), label: 'Floor 1', levelNumber: 1, version: 1 },
  room = {
    id: id(10),
    label: '101',
    archivedAt: null,
    seats: [
      { id: id(11), label: 'A', status: 'active', archivedAt: null, monthlyRentPaisa: 1_500_000 },
    ],
  };
function serve(permissions: string[]) {
  vi.mocked(readPropertyBuildings).mockResolvedValue({
    data: [{ ...building, archivedAt: null }],
    nextCursor: null,
    canEdit: permissions.includes('inventory_edit'),
  } as never);
  vi.mocked(readPropertyFloors).mockResolvedValue({
    data: [{ ...floor, archivedAt: null }],
    nextCursor: null,
    canEdit: true,
  } as never);
  vi.mocked(readBranchInventory).mockResolvedValue({ permissions, rooms: [room] } as never);
  vi.mocked(readPropertyRoomLocation).mockResolvedValue({
    branchId,
    roomId: room.id,
    roomLabel: room.label,
    version: 1,
    canEdit: true,
    archivedAt: null,
    floor: {
      id: floor.id,
      label: floor.label,
      buildingId: building.id,
      buildingName: building.name,
    },
  } as never);
  vi.mocked(readBranchOccupancy).mockResolvedValue({
    data: [
      {
        id: room.id,
        label: room.label,
        building,
        floor,
        beds: [{ id: id(11), label: 'A', state: 'occupied', rentStatus: 'overdue' }],
      },
    ],
    nextCursor: null,
  } as never);
}
function show() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RoomsPanel actorId="owner" branchId={branchId} />
    </QueryClientProvider>,
  );
}
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);
it('BRN-001: shows the hierarchy counts, and occupancy only with the stay grant', async () => {
  serve(['inventory_edit', 'stay_manage']);
  show();
  expect(await screen.findByText(/1 floor · 1 room · 1 bed · 1 occupied/)).toBeTruthy();
  cleanup();
  serve(['inventory_edit']);
  show();
  expect(await screen.findByText('1 floor · 1 room · 1 bed')).toBeTruthy();
  expect(readBranchOccupancy).toHaveBeenCalledTimes(1);
});
it('ROOM-002: without inventory_edit the hierarchy is view only', async () => {
  serve(['stay_manage']);
  show();
  expect(await screen.findByText('View only')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Add building' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Delete building/ })).toBeNull();
});
it('CHG-057: a new room is only a number + photo; no bed count or room security is sent', async () => {
  serve(['inventory_edit', 'stay_manage']);
  vi.mocked(createSetupRoom).mockResolvedValue({ id: id(20), branchId, kind: 'room' } as never);
  vi.mocked(attachListingImage).mockResolvedValue({} as never);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Floor 1' }));
  fireEvent.click(screen.getByRole('button', { name: 'Add room' }));
  fireEvent.change(screen.getByLabelText('Room number'), { target: { value: ' 102 ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
  expect(await screen.findByText('Add a room photo first.')).toBeTruthy();
  expect(createSetupRoom).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Attach Room photo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save room' }));
  await waitFor(() => expect(attachListingImage).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createSetupRoom).mock.calls[0]?.slice(1, 3)).toEqual([
    branchId,
    { label: '102', floorId: floor.id },
  ]);
  expect(vi.mocked(attachListingImage).mock.calls[0]?.[2]).toMatchObject({
    target: { kind: 'room', roomId: id(20) },
  });
});
it('CHG-056 / CHG-058: a new bed carries its own rent and security in integer paisa', async () => {
  serve(['inventory_edit', 'stay_manage']);
  vi.mocked(createInventoryBed).mockResolvedValue({ id: id(30), branchId, kind: 'seat' } as never);
  vi.mocked(attachListingImage).mockResolvedValue({} as never);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Floor 1' }));
  fireEvent.click(await screen.findByRole('button', { name: /Room 101/ }));
  expect(await screen.findByRole('button', { name: 'Bed A, Occupied, Overdue' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Add bed' }));
  fireEvent.change(screen.getByLabelText('Bed name'), { target: { value: 'B' } });
  fireEvent.change(screen.getByLabelText('Monthly rent (Rs)'), { target: { value: '16,500' } });
  fireEvent.change(screen.getByLabelText('Security deposit (Rs)'), { target: { value: '5000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Attach Bed photo' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save bed' }));
  await waitFor(() => expect(attachListingImage).toHaveBeenCalledTimes(1));
  expect(vi.mocked(createInventoryBed).mock.calls[0]?.slice(1, 4)).toEqual([
    branchId,
    room.id,
    expect.objectContaining({ label: 'B', monthlyRentPaisa: 1_650_000, depositPaisa: 500_000 }),
  ]);
  expect(vi.mocked(attachListingImage).mock.calls[0]?.[2]).toMatchObject({
    target: { kind: 'bed', roomId: room.id, bedId: id(30) },
  });
});
it('ROOM-002: deleting a room needs a confirmation and archives it with a reason', async () => {
  serve(['inventory_edit', 'stay_manage']);
  vi.mocked(archiveInventory).mockResolvedValue({} as never);
  show();
  fireEvent.click(await screen.findByRole('button', { name: 'Open Floor 1' }));
  fireEvent.click(await screen.findByRole('button', { name: /Room 101/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Delete room 101' }));
  expect(archiveInventory).not.toHaveBeenCalled();
  expect(screen.getByText(/This also removes its beds. History is kept./)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Confirm delete' }));
  await waitFor(() => expect(archiveInventory).toHaveBeenCalledTimes(1));
  expect(vi.mocked(archiveInventory).mock.calls[0]?.slice(1, 5)).toEqual([
    branchId,
    'room',
    room.id,
    'Removed from hostel setup',
  ]);
});
