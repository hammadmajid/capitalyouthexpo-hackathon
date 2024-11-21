import { and, eq, isNull } from 'drizzle-orm';
import { roomTypes, rooms, seats } from '@hsm/db';
import { DomainError } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
export type LifecycleTarget = { kind: 'room_type' | 'room' | 'seat'; id: string };
// The caller already holds the exact branch hierarchy lock before child locks.
export async function lockLifecycleTarget(
  database: Transaction,
  branchId: string,
  target: LifecycleTarget,
) {
  if (target.kind === 'room_type') {
    const [type] = await database
      .select()
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, target.id),
          eq(roomTypes.branchId, branchId),
          isNull(roomTypes.archivedAt),
        ),
      )
      .for('update');
    if (!type) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
    const physical = await database
      .select({ id: rooms.id })
      .from(rooms)
      .where(
        and(eq(rooms.roomTypeId, type.id), eq(rooms.branchId, branchId), isNull(rooms.archivedAt)),
      )
      .orderBy(rooms.id)
      .for('update');
    return { roomIds: physical.map((room) => room.id), seatId: null, previousStatus: null };
  }
  let roomId = target.id;
  let bedStatus: 'active' | 'inactive' | 'maintenance' | null = null;
  if (target.kind === 'seat') {
    const [bed] = await database
      .select()
      .from(seats)
      .where(and(eq(seats.id, target.id), eq(seats.branchId, branchId), isNull(seats.archivedAt)))
      .for('update');
    if (!bed) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
    roomId = bed.roomId;
    bedStatus = bed.status;
  }
  const [room] = await database
    .select()
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.branchId, branchId), isNull(rooms.archivedAt)))
    .for('update');
  if (!room) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  const [type] = await database
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.id, room.roomTypeId),
        eq(roomTypes.branchId, branchId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .for('update');
  if (!type) throw new DomainError('CONFLICT', 409, 'Room type is archived');
  return {
    roomIds: [room.id],
    seatId: target.kind === 'seat' ? target.id : null,
    previousStatus: bedStatus ?? room.status,
  };
}
