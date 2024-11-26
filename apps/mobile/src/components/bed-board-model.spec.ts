import { describe, expect, it } from 'vitest';
import {
  bedStatusText,
  bedTone,
  boardFloors,
  boardStats,
  groupBoard,
  type BoardRoom,
} from './bed-board-model';
const id = (n: number) => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
function bed(n: number, state: BoardRoom['beds'][number]['state'], rentStatus = null as never) {
  return {
    id: id(n),
    label: 'B' + n,
    ordinal: n,
    status: 'active' as const,
    state,
    rentStatus,
    occupant: state === 'occupied' ? { stayId: id(900 + n), displayName: 'R' + n } : null,
  };
}
const buildingA = { id: id(500), name: 'Building A' };
const floor1 = { id: id(601), label: 'Floor 1', levelNumber: 1 };
const floor2 = { id: id(602), label: 'Floor 2', levelNumber: 2 };
const rooms: BoardRoom[] = [
  {
    id: id(101),
    label: '201',
    roomTypeId: id(1),
    status: 'active',
    building: buildingA,
    floor: floor2,
    beds: [bed(1, 'occupied', 'due' as never), bed(2, 'available')],
  },
  {
    id: id(102),
    label: '101',
    roomTypeId: id(1),
    status: 'active',
    building: buildingA,
    floor: floor1,
    beds: [
      bed(3, 'occupied', 'paid' as never),
      bed(4, 'occupied', 'overdue' as never),
      bed(5, 'reserved'),
    ],
  },
  {
    id: id(103),
    label: 'Annex',
    roomTypeId: id(1),
    status: 'active',
    building: null,
    floor: null,
    beds: [bed(6, 'unavailable'), bed(7, 'occupied', 'clear' as never)],
  },
];
describe('Bed Board model (CHG-048)', () => {
  it('BED-001 / PAY-008: green only for paid, white only for vacant', () => {
    expect(bedTone({ state: 'occupied', rentStatus: 'paid' })).toBe('paid');
    expect(bedTone({ state: 'occupied', rentStatus: 'due' })).toBe('due');
    expect(bedTone({ state: 'occupied', rentStatus: 'overdue' })).toBe('overdue');
    expect(bedTone({ state: 'occupied', rentStatus: 'clear' })).toBe('occupied');
    expect(bedTone({ state: 'occupied', rentStatus: null })).toBe('occupied');
    expect(bedTone({ state: 'available', rentStatus: null })).toBe('vacant');
    expect(bedTone({ state: 'reserved', rentStatus: null })).toBe('reserved');
    expect(bedTone({ state: 'occupied', rentStatus: 'proof_pending' })).toBe('proof');
    expect(bedStatusText({ state: 'reserved', rentStatus: null })).toBe('Reserved');
    expect(bedStatusText({ state: 'occupied', rentStatus: 'proof_pending' })).toBe(
      'Occupied, Proof sent',
    );
    expect(bedTone({ state: 'blocked', rentStatus: null })).toBe('held');
    expect(bedTone({ state: 'unavailable', rentStatus: null })).toBe('off');
    expect(bedStatusText({ state: 'blocked', rentStatus: null })).toBe('Blocked');
    expect(bedStatusText({ state: 'occupied', rentStatus: 'due' })).toBe('Occupied, Due');
    expect(bedStatusText({ state: 'occupied', rentStatus: 'clear' })).toBe(
      'Occupied, nothing billed yet',
    );
  });
  it('counts beds, occupancy and rent from the same server states', () => {
    expect(boardStats(rooms)).toEqual({
      beds: 7,
      occupied: 4,
      vacant: 1,
      reserved: 1,
      paid: 1,
      due: 1,
      overdue: 1,
      proof: 0,
      finance: true,
    });
    const noFinance = rooms.map((room) => ({
      ...room,
      beds: room.beds.map((item) => ({ ...item, rentStatus: null })),
    }));
    expect(boardStats(noFinance).finance).toBe(false);
  });
  it('groups building, floor (by level) and rooms (natural order), honouring filters', () => {
    const groups = groupBoard(rooms, {});
    expect(groups.map((group) => group.building.name)).toEqual(['Building A', 'Rooms']);
    expect(groups[0]?.floors.map((row) => row.floor.name)).toEqual(['Floor 1', 'Floor 2']);
    expect(groups[1]?.floors[0]?.rooms.map((room) => room.label)).toEqual(['Annex']);
    expect(groupBoard(rooms, { building: buildingA.id, floor: floor2.id })).toEqual([
      {
        building: buildingA,
        floors: [{ floor: { id: floor2.id, name: 'Floor 2' }, rooms: [rooms[0]] }],
      },
    ]);
    expect(boardFloors(rooms, buildingA.id).map((row) => row.name)).toEqual(['Floor 1', 'Floor 2']);
  });
});
