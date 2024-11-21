import { and, eq, isNull } from 'drizzle-orm';
import { rooms, roomTypes, seats } from '@hsm/db';
import type { InventoryImportKind, InventoryImportRow } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function validateImportRows(
  tx: Transaction,
  branchId: string,
  kind: InventoryImportKind,
  input: InventoryImportRow[],
) {
  const rows = input.map((row) => ({ ...row, errors: [...row.errors] }));
  const bedPlans = new Map<string, { ordinal: number; labels: Set<string> }>();
  let newBeds = 0;
  for (const row of rows) {
    if (row.errors.length) continue;
    if (kind === 'rooms') {
      const [type] = await tx
        .select()
        .from(roomTypes)
        .where(
          and(
            eq(roomTypes.id, row.roomTypeId ?? ''),
            eq(roomTypes.branchId, branchId),
            isNull(roomTypes.archivedAt),
          ),
        )
        .for('update');
      if (!type || type.setupManaged) {
        row.errors.push('ROOM_TYPE_UNAVAILABLE');
        continue;
      }
      const [existing] = await tx
        .select({ id: rooms.id })
        .from(rooms)
        .where(
          and(
            eq(rooms.branchId, branchId),
            eq(rooms.label, row.roomNumber),
            isNull(rooms.archivedAt),
          ),
        )
        .limit(1);
      if (existing) row.errors.push('ROOM_NUMBER_EXISTS');
      newBeds += type.capacity;
    } else {
      let plan = bedPlans.get(row.roomNumber);
      if (!plan) {
        const [room] = await tx
          .select({
            id: rooms.id,
            setupManaged: roomTypes.setupManaged,
          })
          .from(rooms)
          .innerJoin(
            roomTypes,
            and(eq(roomTypes.id, rooms.roomTypeId), eq(roomTypes.branchId, branchId)),
          )
          .where(
            and(
              eq(rooms.branchId, branchId),
              eq(rooms.label, row.roomNumber),
              isNull(rooms.archivedAt),
              isNull(roomTypes.archivedAt),
            ),
          )
          .for('update');
        if (!room || room.setupManaged) {
          row.errors.push('ROOM_UNAVAILABLE');
          continue;
        }
        const beds = await tx
          .select()
          .from(seats)
          .where(and(eq(seats.branchId, branchId), eq(seats.roomId, room.id)))
          .for('update');
        plan = {
          ordinal: beds.reduce((maximum, bed) => Math.max(maximum, bed.ordinal), 0),
          labels: new Set(beds.filter((bed) => !bed.archivedAt).map((bed) => bed.label)),
        };
        bedPlans.set(row.roomNumber, plan);
      }
      if (plan.labels.has(row.bedLabel ?? '')) row.errors.push('BED_LABEL_EXISTS');
      if (plan.ordinal >= 2147483646) row.errors.push('CAPACITY_EXCEEDED');
      plan.ordinal++;
      plan.labels.add(row.bedLabel ?? '');
      newBeds++;
    }
    if (newBeds > 5000) row.errors.push('BATCH_TOO_LARGE');
  }
  return rows;
}
