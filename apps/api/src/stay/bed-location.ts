import { and, eq } from 'drizzle-orm';
import { brands, branches, buildings, floors, rooms } from '@hsm/db';
import { bedLocationSchema, DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
// Called only after live stay_manage scope validation; nullable physical location stays explicit.
export async function readBedLocation(tx: Transaction, branchId: string, roomId: string) {
  const [row] = await tx
    .select({
      hostel: { id: brands.id, name: brands.name },
      branch: { id: branches.id, name: branches.name },
      building: { id: buildings.id, name: buildings.name },
      floor: { id: floors.id, label: floors.label, levelNumber: floors.levelNumber },
    })
    .from(rooms)
    .innerJoin(branches, eq(branches.id, rooms.branchId))
    .innerJoin(
      brands,
      and(eq(brands.id, branches.brandId), eq(brands.organizationId, branches.organizationId)),
    )
    .leftJoin(floors, and(eq(floors.id, rooms.floorId), eq(floors.branchId, branchId)))
    .leftJoin(buildings, and(eq(buildings.id, floors.buildingId), eq(buildings.branchId, branchId)))
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId)));
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Bed location unavailable');
  return bedLocationSchema.parse(row);
}
