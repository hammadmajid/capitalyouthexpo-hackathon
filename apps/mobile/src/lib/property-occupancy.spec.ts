import { expect, it, vi } from 'vitest';
import { readBranchOccupancy, type ApiClient } from '@hsm/api-client';
import { readPropertyOccupancy, occupiedInRooms } from './property-occupancy';
vi.mock('@hsm/api-client', () => ({ readBranchOccupancy: vi.fn() }));
it('BRN-001 / BED-001: counts current occupants on every page and excludes reservations', async () => {
  vi.mocked(readBranchOccupancy)
    .mockResolvedValueOnce({
      data: [{ id: 'room', beds: [{ state: 'occupied' }, { state: 'reserved' }] }],
      nextCursor: 'room',
    } as never)
    .mockResolvedValueOnce({
      data: [{ id: 'other', beds: [{ state: 'occupied' }] }],
      nextCursor: null,
    } as never);
  const rooms = await readPropertyOccupancy({} as ApiClient, 'branch');
  expect(occupiedInRooms(rooms, ['room'])).toBe(1);
  expect(occupiedInRooms(rooms, ['room', 'other'])).toBe(2);
});
it('BRN-001: fails repeated pages instead of inflating counts', async () => {
  vi.mocked(readBranchOccupancy).mockResolvedValue({
    data: [{ id: 'room' }],
    nextCursor: 'room',
  } as never);
  await expect(readPropertyOccupancy({} as ApiClient, 'branch')).rejects.toThrow('Duplicate');
});
