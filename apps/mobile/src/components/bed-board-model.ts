import type { OccupancyPage } from '@hsm/contracts';
export type BoardRoom = OccupancyPage['data'][number];
export type BoardBed = BoardRoom['beds'][number];
// CHG-048 / BED-001: one colour rule for every bed circle. Green only for a receipt-backed
// paid invoice with nothing open (PAY-008); white only for a bed that can take a resident;
// silver for a reserved bed; light blue while a resident's proof waits for review.
export type BedTone =
  'paid' | 'due' | 'overdue' | 'proof' | 'vacant' | 'reserved' | 'occupied' | 'held' | 'off';
export function bedTone(bed: Pick<BoardBed, 'state' | 'rentStatus'>): BedTone {
  if (bed.state === 'available') return 'vacant';
  if (bed.state === 'unavailable') return 'off';
  if (bed.state === 'reserved') return 'reserved';
  if (bed.state !== 'occupied') return 'held';
  if (bed.rentStatus === 'proof_pending') return 'proof';
  if (bed.rentStatus === 'overdue') return 'overdue';
  if (bed.rentStatus === 'due') return 'due';
  if (bed.rentStatus === 'paid') return 'paid';
  return 'occupied';
}
export const toneLabel: Record<BedTone, string> = {
  paid: 'Paid',
  due: 'Due',
  overdue: 'Overdue',
  proof: 'Proof sent',
  vacant: 'Vacant',
  reserved: 'Reserved',
  occupied: 'Occupied',
  held: 'Blocked',
  off: 'Off',
};
// Spoken status for a bed: tone plus the exact occupancy state when it differs.
export function bedStatusText(bed: Pick<BoardBed, 'state' | 'rentStatus'>) {
  const tone = bedTone(bed);
  if (tone === 'paid' || tone === 'due' || tone === 'overdue' || tone === 'proof')
    return 'Occupied, ' + toneLabel[tone];
  if (tone === 'occupied' && bed.rentStatus === 'clear') return 'Occupied, nothing billed yet';
  return toneLabel[tone];
}
export type BoardStats = {
  beds: number;
  occupied: number;
  vacant: number;
  // Booked or held for an incoming resident (silver on the board).
  reserved: number;
  paid: number;
  due: number;
  overdue: number;
  // A resident proof waits for review (light blue); never counted as paid.
  proof: number;
  // Rent counts only exist for finance_view holders (rentStatus is never null for them).
  finance: boolean;
};
export function boardStats(rooms: readonly BoardRoom[]): BoardStats {
  const stats: BoardStats = {
    beds: 0,
    occupied: 0,
    vacant: 0,
    reserved: 0,
    paid: 0,
    due: 0,
    overdue: 0,
    proof: 0,
    finance: false,
  };
  for (const bed of rooms.flatMap((room) => room.beds)) {
    stats.beds += 1;
    const tone = bedTone(bed);
    if (bed.state === 'occupied') stats.occupied += 1;
    if (bed.rentStatus != null) stats.finance = true;
    if (tone === 'vacant') stats.vacant += 1;
    if (tone === 'reserved') stats.reserved += 1;
    if (tone === 'paid' || tone === 'due' || tone === 'overdue' || tone === 'proof')
      stats[tone] += 1;
  }
  return stats;
}
export type Place = { id: string; name: string };
const none = '';
// Building and floor choices present in the board, in a stable, human order.
export function boardBuildings(rooms: readonly BoardRoom[]): Place[] {
  const seen = new Map<string, string>();
  for (const room of rooms) seen.set(room.building?.id ?? none, room.building?.name ?? 'Rooms');
  return [...seen].map(([id, name]) => ({ id, name })).sort(byName);
}
export function boardFloors(rooms: readonly BoardRoom[], building?: string): Place[] {
  const seen = new Map<string, { name: string; level: number }>();
  for (const room of rooms) {
    if (building !== undefined && (room.building?.id ?? none) !== building) continue;
    seen.set(room.floor?.id ?? none, {
      name: room.floor?.label ?? 'No floor',
      level: room.floor?.levelNumber ?? Number.MAX_SAFE_INTEGER,
    });
  }
  return [...seen]
    .sort((left, right) => left[1].level - right[1].level || byName(left[1], right[1]))
    .map(([id, value]) => ({ id, name: value.name }));
}
export type BoardGroup = {
  building: Place;
  floors: { floor: Place; rooms: BoardRoom[] }[];
};
// Building -> floor -> rooms, honouring the chosen filters. Labels sort naturally (101 < 1001).
export function groupBoard(
  rooms: readonly BoardRoom[],
  filter: { building?: string | undefined; floor?: string | undefined },
): BoardGroup[] {
  const chosen = rooms.filter(
    (room) =>
      (filter.building === undefined || (room.building?.id ?? none) === filter.building) &&
      (filter.floor === undefined || (room.floor?.id ?? none) === filter.floor),
  );
  return boardBuildings(chosen).map((building) => {
    const inBuilding = chosen.filter((room) => (room.building?.id ?? none) === building.id);
    return {
      building,
      floors: boardFloors(inBuilding).map((floor) => ({
        floor,
        rooms: inBuilding
          .filter((room) => (room.floor?.id ?? none) === floor.id)
          .sort((left, right) => collator.compare(left.label, right.label)),
      })),
    };
  });
}
export function filteredRooms(
  rooms: readonly BoardRoom[],
  filter: { building?: string | undefined; floor?: string | undefined },
) {
  return groupBoard(rooms, filter).flatMap((group) => group.floors.flatMap((row) => row.rooms));
}
const collator = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
function byName(left: { name: string }, right: { name: string }) {
  return collator.compare(left.name, right.name);
}
