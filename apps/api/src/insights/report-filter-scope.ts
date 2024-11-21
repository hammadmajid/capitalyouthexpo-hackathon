import { and, eq, inArray } from 'drizzle-orm';
import { buildings, floors, residents, rooms } from '@hsm/db';
import { DomainError, type ReportFilters } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';

const unavailable = () => new DomainError('NOT_FOUND', 404, 'Report filter unavailable');
// SEC-003 / RPT-001: run only after live report authority. Archived identities
// remain eligible for historical reports; no active-only filter hides old facts.
export async function authorizeReportFilters(tx: Transaction, ids: string[], input: ReportFilters) {
  const targets: { id: string; branchId: string }[] = [];
  let building: { id: string; branchId: string } | undefined;
  let floor: { id: string; branchId: string; buildingId: string } | undefined;
  if (input.buildingId) {
    [building] = await tx
      .select({ id: buildings.id, branchId: buildings.branchId })
      .from(buildings)
      .where(and(eq(buildings.id, input.buildingId), inArray(buildings.branchId, ids)));
    if (!building || building.id !== input.buildingId) throw unavailable();
    targets.push(building);
  }
  if (input.floorId) {
    [floor] = await tx
      .select({ id: floors.id, branchId: floors.branchId, buildingId: floors.buildingId })
      .from(floors)
      .where(and(eq(floors.id, input.floorId), inArray(floors.branchId, ids)));
    if (!floor || floor.id !== input.floorId || (building && floor.buildingId !== building.id))
      throw unavailable();
    targets.push(floor);
  }
  if (input.roomId) {
    const [room] = await tx
      .select({ id: rooms.id, branchId: rooms.branchId, floorId: rooms.floorId })
      .from(rooms)
      .where(and(eq(rooms.id, input.roomId), inArray(rooms.branchId, ids)));
    if (!room || room.id !== input.roomId || (floor && room.floorId !== floor.id))
      throw unavailable();
    targets.push(room);
    // A building+room selection also checks the intermediate parent, even when
    // the caller did not supply a floor. Unknown legacy location never matches.
    if (building && !floor) {
      if (!room.floorId) throw unavailable();
      const [parent] = await tx
        .select({ id: floors.id, branchId: floors.branchId, buildingId: floors.buildingId })
        .from(floors)
        .where(and(eq(floors.id, room.floorId), eq(floors.branchId, room.branchId)));
      if (!parent || parent.id !== room.floorId || parent.buildingId !== building.id)
        throw unavailable();
      targets.push(parent);
    }
  }
  if (input.residentId) {
    const [resident] = await tx
      .select({ id: residents.id, branchId: residents.branchId })
      .from(residents)
      .where(and(eq(residents.id, input.residentId), inArray(residents.branchId, ids)));
    if (!resident || resident.id !== input.residentId) throw unavailable();
    targets.push(resident);
  }
  if (targets.some((row) => !ids.includes(row.branchId) || row.branchId !== targets[0]?.branchId))
    throw unavailable();
  return targets[0]?.branchId;
}
