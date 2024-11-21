import { and, eq, isNull, max } from 'drizzle-orm';
import { v7 } from 'uuid';
import { rooms, roomTypes, seats } from '@hsm/db';
import { DomainError, type InventoryImportKind, type InventoryImportRow } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export async function applyImportRows(
  tx: Transaction,
  branchId: string,
  kind: InventoryImportKind,
  rows: InventoryImportRow[],
) {
  const created: { recordNumber: number; roomId: string; seatIds: string[] }[] = [];
  for (const row of rows) {
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
        );
      if (!type) throw new DomainError('CONFLICT', 409, 'Room type changed; validate again');
      const roomId = v7();
      await tx
        .insert(rooms)
        .values({
          id: roomId,
          branchId,
          roomTypeId: type.id,
          label: row.roomNumber,
          status: 'inactive',
        });
      const beds = Array.from({ length: type.capacity }, (_, index) => ({
        id: v7(),
        branchId,
        roomId,
        ordinal: index + 1,
        label: 'B' + (index + 1),
        status: 'inactive' as const,
      }));
      await tx.insert(seats).values(beds);
      created.push({ recordNumber: row.recordNumber, roomId, seatIds: beds.map((bed) => bed.id) });
    } else {
      const [room] = await tx
        .select()
        .from(rooms)
        .where(
          and(
            eq(rooms.branchId, branchId),
            eq(rooms.label, row.roomNumber),
            isNull(rooms.archivedAt),
          ),
        );
      if (!room) throw new DomainError('CONFLICT', 409, 'Room changed; validate again');
      const [last] = await tx
        .select({ ordinal: max(seats.ordinal) })
        .from(seats)
        .where(and(eq(seats.branchId, branchId), eq(seats.roomId, room.id)));
      const seatId = v7();
      await tx
        .insert(seats)
        .values({
          id: seatId,
          branchId,
          roomId: room.id,
          ordinal: (last?.ordinal ?? 0) + 1,
          label: row.bedLabel ?? '',
          status: 'inactive',
        });
      created.push({ recordNumber: row.recordNumber, roomId: room.id, seatIds: [seatId] });
    }
  }
  return created;
}
