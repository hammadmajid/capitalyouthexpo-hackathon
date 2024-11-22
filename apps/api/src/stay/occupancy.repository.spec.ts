import { beforeEach, expect, it, vi } from 'vitest';
import { inventoryClaims, rooms, seats, stays } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockActor } from '../auth/actor-lock.js';
import { lockInventoryScope } from '../inventory/scope.js';
import { OccupancyRepository } from './occupancy.repository.js';
import { occupancyService, OccupancyService } from './occupancy.service.js';
vi.mock('../auth/actor-lock.js', () => ({ lockActor: vi.fn() }));
vi.mock('../inventory/scope.js', () => ({ lockInventoryScope: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
const branch = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  roomA = '10000000-0000-4000-8000-000000000001',
  roomB = '10000000-0000-4000-8000-000000000002',
  bedA = '20000000-0000-4000-8000-000000000001',
  bedB = '20000000-0000-4000-8000-000000000002',
  stay = '30000000-0000-4000-8000-000000000001',
  type = '40000000-0000-4000-8000-000000000001';
const actor = { userId: '50000000-0000-4000-8000-000000000001' } as never;
// 2026-10-25T20:00Z is already 2026-10-26 in Asia/Karachi.
const now = new Date('2026-10-25T20:00:00Z');
function seed(claims: unknown[]) {
  const store = queryFixture();
  store.enqueue(rooms, [
    { id: roomA, label: '101', roomTypeId: type, status: 'active' },
    { id: roomB, label: '102', roomTypeId: type, status: 'active' },
  ]);
  store.enqueue(seats, [
    { id: bedA, roomId: roomA, label: 'A', ordinal: 1, status: 'active' },
    { id: bedB, roomId: roomB, label: 'A', ordinal: 1, status: 'active' },
  ]);
  store.enqueue(inventoryClaims, claims);
  return store;
}
it('BED-001 / RES-004: reads under the stay_manage scope with Karachi today and pages rooms', async () => {
  const store = seed([
    {
      roomId: roomA,
      seatId: bedA,
      assignmentId: stay,
      blockId: null,
      stayId: stay,
      displayName: 'Resident',
    },
    {
      roomId: roomB,
      seatId: null,
      assignmentId: null,
      blockId: stay,
      stayId: null,
      displayName: null,
    },
  ]);
  store.enqueue(stays, [{ id: stay }]);
  const repository = new OccupancyRepository(store.database, () => now);
  const page = await repository.page(actor, branch, { limit: 1 });
  expect(page.on).toBe('2026-10-26');
  expect(page.totals).toMatchObject({ beds: 2, occupied: 1, blocked: 1 });
  expect(page.data.map((room) => room.id)).toEqual([roomA]);
  expect(page.nextCursor).toBe(roomA);
  expect(page.data[0]?.beds[0]?.occupant).toEqual({ stayId: stay, displayName: 'Resident' });
  expect(lockInventoryScope).toHaveBeenCalledWith(store.transaction, actor, branch, 'stay_manage');
  expect(lockActor).toHaveBeenCalledTimes(2);
  expect(store.writes).toHaveLength(0);
});
it('BED-001: explicit date and cursor continue after the previous room; reservations stay reserved', async () => {
  const store = seed([
    {
      roomId: roomB,
      seatId: bedB,
      assignmentId: null,
      blockId: null,
      stayId: null,
      displayName: null,
    },
  ]);
  const page = await new OccupancyRepository(store.database, () => now).page(actor, branch, {
    limit: 5,
    cursor: roomA,
    on: '2026-11-01',
  });
  expect(page.on).toBe('2026-11-01');
  expect(page.data.map((room) => room.id)).toEqual([roomB]);
  expect(page.data[0]?.beds[0]?.state).toBe('reserved');
  expect(page.nextCursor).toBeNull();
});
it('RES-004: an assignment without Stay lineage is an internal error', async () => {
  const store = seed([
    {
      roomId: roomA,
      seatId: bedA,
      assignmentId: stay,
      blockId: null,
      stayId: null,
      displayName: null,
    },
  ]);
  await expect(
    new OccupancyRepository(store.database, () => now).page(actor, branch, { limit: 5 }),
  ).rejects.toMatchObject({ status: 500 });
});
it('BED-001: the factory builds the production service', () => {
  expect(occupancyService(queryFixture().database)).toBeInstanceOf(OccupancyService);
});
it('BED-002: bed detail lists covering claims and filters narrow rooms but not totals', async () => {
  const store = queryFixture();
  store.enqueue(seats, [
    {
      seat: { id: bedA, roomId: roomA, label: 'A', ordinal: 1, status: 'active' },
      room: { id: roomA, label: '101', roomTypeId: type, status: 'active' },
      roomTypeName: 'Standard',
    },
  ]);
  store.enqueue(inventoryClaims, [
    {
      roomId: roomA,
      seatId: null,
      assignmentId: null,
      blockId: null,
      bookingId: stay,
      holdId: null,
      moveInDate: '2026-10-20',
      moveOutDate: '2026-11-20',
      stayId: null,
      displayName: null,
    },
    {
      roomId: roomA,
      seatId: bedA,
      assignmentId: null,
      blockId: null,
      bookingId: null,
      holdId: stay,
      moveInDate: '2026-10-26',
      moveOutDate: '2026-10-27',
      stayId: null,
      displayName: null,
    },
  ]);
  store.enqueue(rooms, [
    {
      hostel: { id: branch, name: 'Hostel' },
      branch: { id: branch, name: 'Branch' },
      building: null,
      floor: null,
    },
  ]);
  const detail = await new OccupancyRepository(store.database, () => now).bed(actor, branch, bedA);
  expect(detail.location.hostel.name).toBe('Hostel');
  expect(detail.on).toBe('2026-10-26');
  expect(detail.bed.state).toBe('reserved');
  expect(detail.room.roomTypeName).toBe('Standard');
  expect(detail.claims.map((claim) => [claim.source, claim.wholeRoom])).toEqual([
    ['booking', true],
    ['hold', false],
  ]);
  await expect(
    new OccupancyRepository(queryFixture().database, () => now).bed(
      actor,
      branch,
      bedA,
      '2026-11-01',
    ),
  ).rejects.toMatchObject({ status: 404 });
  const filtered = seed([
    {
      roomId: roomB,
      seatId: bedB,
      assignmentId: null,
      blockId: stay,
      stayId: null,
      displayName: null,
    },
  ]);
  const page = await new OccupancyRepository(filtered.database, () => now).page(actor, branch, {
    limit: 20,
    state: 'blocked',
    roomTypeId: type,
  });
  expect(page.data.map((room) => room.id)).toEqual([roomB]);
  expect(page.totals.beds).toBe(2);
  const none = await new OccupancyRepository(seed([]).database, () => now).page(actor, branch, {
    limit: 20,
    roomId: roomB,
    state: 'occupied',
  });
  expect(none.data).toEqual([]);
});
