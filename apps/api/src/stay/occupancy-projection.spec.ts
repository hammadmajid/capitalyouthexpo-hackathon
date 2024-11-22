import { describe, expect, it } from 'vitest';
import { bedOccupancyStateSchema, occupancyPageSchema } from '@hsm/contracts';
import { projectOccupancy, type OccupancyClaimRow } from './occupancy-projection.js';
const ids = Array.from({ length: 8 }, (_, index) => `0000000${index}-0000-4000-8000-000000000000`);
const [roomA, roomB, bed1, bed2, bed3, bed4, bed5, stayId] = ids as [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];
const type = '11111111-1111-4111-8111-111111111111';
const rooms = [
  { id: roomA, label: '101', roomTypeId: type, status: 'active' as const },
  { id: roomB, label: '102', roomTypeId: type, status: 'maintenance' as const },
];
const seats = [
  { id: bed2, roomId: roomA, label: 'B', ordinal: 2, status: 'active' as const },
  { id: bed1, roomId: roomA, label: 'A', ordinal: 1, status: 'active' as const },
  { id: bed3, roomId: roomA, label: 'C', ordinal: 3, status: 'inactive' as const },
  { id: bed4, roomId: roomA, label: 'D', ordinal: 4, status: 'active' as const },
  { id: bed5, roomId: roomB, label: 'A', ordinal: 1, status: 'active' as const },
];
const occupant = { stayId, displayName: 'Resident' };
describe('projectOccupancy', () => {
  it.each(bedOccupancyStateSchema.options)(
    'RPT-001 / AUD-010: %s totals count only matching projected beds',
    (state) => {
      const claims: OccupancyClaimRow[] = [
        { roomId: roomA, seatId: bed1, kind: 'assignment', occupant },
        { roomId: roomA, seatId: bed2, kind: 'block', occupant: null },
        { roomId: roomA, seatId: bed4, kind: 'reservation', occupant: null },
      ];
      const narrowed = projectOccupancy(rooms, seats, claims, state);
      const expected = state === 'available' ? 0 : state === 'unavailable' ? 2 : 1;
      expect(narrowed.rooms.flatMap((room) => room.beds).every((bed) => bed.state === state)).toBe(
        true,
      );
      expect(narrowed.totals).toEqual({
        beds: expected,
        occupied: state === 'occupied' ? expected : 0,
        blocked: state === 'blocked' ? expected : 0,
        reserved: state === 'reserved' ? expected : 0,
        unavailable: state === 'unavailable' ? expected : 0,
        available: 0,
      });
    },
  );
  it('BED-001 / STAY-001: a reservation is never occupancy and precedence is explicit', () => {
    const claims: OccupancyClaimRow[] = [
      { roomId: roomA, seatId: bed1, kind: 'reservation', occupant: null },
      { roomId: roomA, seatId: bed1, kind: 'assignment', occupant },
      { roomId: roomA, seatId: bed2, kind: 'reservation', occupant: null },
      { roomId: roomA, seatId: bed2, kind: 'block', occupant: null },
      { roomId: roomA, seatId: bed4, kind: 'reservation', occupant: null },
    ];
    const { rooms: projected, totals } = projectOccupancy(rooms, seats, claims);
    expect(projected[0]?.beds.map((bed) => [bed.label, bed.state, bed.occupant])).toEqual([
      ['A', 'occupied', occupant],
      ['B', 'blocked', null],
      ['C', 'unavailable', null],
      ['D', 'reserved', null],
    ]);
    expect(projected[1]?.beds.map((bed) => bed.state)).toEqual(['unavailable']);
    expect(totals).toEqual({
      beds: 5,
      occupied: 1,
      blocked: 1,
      reserved: 1,
      unavailable: 2,
      available: 0,
    });
  });
  it('BED-001: a whole-room claim covers every bed in that room only', () => {
    const { rooms: projected, totals } = projectOccupancy(
      rooms.slice(0, 1),
      seats.filter((seat) => seat.roomId === roomA),
      [{ roomId: roomA, seatId: null, kind: 'reservation', occupant: null }],
    );
    expect(projected[0]?.beds.map((bed) => bed.state)).toEqual([
      'reserved',
      'reserved',
      'reserved',
      'reserved',
    ]);
    expect(totals.available).toBe(0);
  });
  it('BED-001: empty active inventory is available and parses as a page', () => {
    const { rooms: projected, totals } = projectOccupancy(rooms.slice(0, 1), seats.slice(0, 2), []);
    expect(totals).toMatchObject({ beds: 2, available: 2 });
    expect(
      occupancyPageSchema.parse({
        branchId: type,
        on: '2026-10-26',
        totals,
        data: projected,
        nextCursor: null,
      }).data[0]?.beds,
    ).toHaveLength(2);
  });
});
