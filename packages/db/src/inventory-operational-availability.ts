import { and, eq, exists, inArray, isNull, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { Database } from './index.js';
import { branches, rooms, roomTypes, seats } from './schema/index.js';
import {
  inventoryOptionAvailability,
  inventoryWholeRoomOperational,
} from './inventory-public-policy.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const room = alias(rooms, 'waitlist_room'),
  type = alias(roomTypes, 'waitlist_type'),
  bed = alias(seats, 'waitlist_bed');
// WAIT-001 / ACC-001: the same operational and claim-overlap policy as marketplace discovery.
export async function hasOperationalInventoryAvailability(
  tx: Transaction,
  branchId: string,
  range: { moveInDate: string; moveOutDate: string },
  now: Date,
  roomTypeId?: string,
) {
  const condition = and(
    eq(room.branchId, branchId),
    eq(type.branchId, room.branchId),
    isNull(room.archivedAt),
    eq(room.status, 'active'),
    isNull(type.archivedAt),
    roomTypeId ? eq(type.id, roomTypeId) : undefined,
  );
  const beds = tx
    .select({ id: bed.id })
    .from(room)
    .innerJoin(type, eq(type.id, room.roomTypeId))
    .innerJoin(bed, and(eq(bed.roomId, room.id), eq(bed.branchId, room.branchId)))
    .where(
      and(
        condition,
        inArray(type.inventoryMode, ['per_bed', 'both']),
        isNull(bed.archivedAt),
        eq(bed.status, 'active'),
        inventoryOptionAvailability(tx, room.branchId, range, now, true, room.id, bed.id),
      ),
    );
  const whole = tx
    .select({ id: room.id })
    .from(room)
    .innerJoin(type, eq(type.id, room.roomTypeId))
    .where(
      and(
        condition,
        inArray(type.inventoryMode, ['whole_room', 'both']),
        inventoryWholeRoomOperational(tx, room.branchId, room.id),
        inventoryOptionAvailability(tx, room.branchId, range, now, false, room.id),
      ),
    );
  const [result] = await tx
    .select({ available: sql<boolean>`${exists(beds)} or ${exists(whole)}` })
    .from(branches)
    .where(eq(branches.id, branchId))
    .limit(1);
  return result?.available === true;
}
