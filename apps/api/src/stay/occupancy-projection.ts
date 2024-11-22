import type { BedOccupancyState, OccupancyTotals } from '@hsm/contracts';
type Status = 'active' | 'inactive' | 'maintenance';
export type OccupancyRoomRow = {
  id: string;
  label: string;
  roomTypeId: string;
  status: Status;
};
export type OccupancySeatRow = {
  id: string;
  roomId: string;
  label: string;
  ordinal: number;
  status: Status;
};
// A live claim already filtered to the requested date by the repository.
export type OccupancyClaimRow = {
  roomId: string;
  seatId: string | null;
  kind: 'assignment' | 'block' | 'reservation';
  occupant: { stayId: string; displayName: string } | null;
};
const rank: Record<OccupancyClaimRow['kind'], number> = { assignment: 3, block: 2, reservation: 1 };
const stateOf: Record<OccupancyClaimRow['kind'], BedOccupancyState> = {
  assignment: 'occupied',
  block: 'blocked',
  reservation: 'reserved',
};
// A room-level claim (null seat) covers every bed in that room.
function strongest(claims: OccupancyClaimRow[], seat: OccupancySeatRow) {
  return claims
    .filter((claim) => claim.roomId === seat.roomId && (claim.seatId ?? seat.id) === seat.id)
    .sort((left, right) => rank[right.kind] - rank[left.kind])[0];
}
// BED-001 / STAY-001: occupied > blocked > reserved > unavailable > available. A booking or
// hold is a reservation and never occupancy; inactive or maintenance inventory is unavailable.
export function projectOccupancy<Room extends OccupancyRoomRow>(
  rooms: Room[],
  seats: OccupancySeatRow[],
  claims: OccupancyClaimRow[],
  stateFilter?: BedOccupancyState,
) {
  const totals: OccupancyTotals = {
    beds: 0,
    occupied: 0,
    blocked: 0,
    reserved: 0,
    unavailable: 0,
    available: 0,
  };
  const projected = rooms.map((room) => ({
    ...room,
    beds: seats
      .filter((seat) => seat.roomId === room.id)
      .sort((left, right) => left.ordinal - right.ordinal)
      .map((seat) => {
        const claim = strongest(claims, seat);
        const state: BedOccupancyState = claim
          ? stateOf[claim.kind]
          : room.status !== 'active' || seat.status !== 'active'
            ? 'unavailable'
            : 'available';
        return {
          id: seat.id,
          label: seat.label,
          ordinal: seat.ordinal,
          status: seat.status,
          state,
          occupant: state === 'occupied' ? (claim?.occupant ?? null) : null,
        };
      })
      .filter((bed) => stateFilter === undefined || bed.state === stateFilter)
      .map((bed) => {
        totals.beds += 1;
        totals[bed.state] += 1;
        return bed;
      }),
  }));
  return { rooms: projected, totals };
}
