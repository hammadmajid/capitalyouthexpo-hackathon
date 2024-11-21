import { and, eq, getTableColumns, isNull } from 'drizzle-orm';
import { publishedBedPhoto, publishedRoomPhoto } from '../marketplace/selectable-media.js';
import { rooms, seats } from '@hsm/db';
import { DomainError, type QuoteInput } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
import { inventoryAvailable } from './availability.js';
export async function automaticallyAllocate(
  database: Transaction,
  branchId: string,
  roomTypeId: string,
  input: QuoteInput,
  now: Date,
) {
  const candidates = await database
    .select()
    .from(rooms)
    .where(
      and(
        eq(rooms.branchId, branchId),
        eq(rooms.roomTypeId, roomTypeId),
        eq(rooms.status, 'active'),
        isNull(rooms.archivedAt),
        // ROOM-003: automatic allocation chooses only publicly selectable inventory.
        publishedRoomPhoto(database, branchId, rooms.id),
      ),
    )
    .orderBy(rooms.id)
    .for('update');
  for (const room of candidates) {
    const beds = await database
      .select({
        ...getTableColumns(seats),
        photographed: publishedBedPhoto(database, branchId, room.id, seats.id),
      })
      .from(seats)
      .where(and(eq(seats.roomId, room.id), eq(seats.branchId, branchId), isNull(seats.archivedAt)))
      .orderBy(seats.ordinal)
      .for('update');
    if (input.target.kind === 'room') {
      if (beds.some((bed) => bed.status !== 'active')) continue;
      const target = { kind: 'room' as const, roomId: room.id };
      if (await inventoryAvailable(database, { target, range: input.range }, now))
        return { room, seat: undefined, target };
    } else
      for (const { photographed, ...bed } of beds) {
        if (bed.status !== 'active' || !photographed) continue;
        const target = { kind: 'bed' as const, roomId: room.id, bedId: bed.id };
        if (await inventoryAvailable(database, { target, range: input.range }, now))
          return { room, seat: bed, target };
      }
  }
  throw new DomainError('CONFLICT', 409, 'No inventory available for automatic allocation');
}
