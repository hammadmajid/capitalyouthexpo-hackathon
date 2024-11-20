import { and, eq, isNull, or } from 'drizzle-orm';
import { z } from 'zod';
import {
  DomainError,
  inventoryModeSchema,
  inventoryTargetSchema,
  stayIdentifierSchema,
  type InventoryTarget,
} from '@hsm/contracts';
import { rooms, roomTypes, seats } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
const inputSchema = z
  .object({ branchId: stayIdentifierSchema, target: inventoryTargetSchema })
  .strict();
const status = z.enum(['active', 'inactive', 'maintenance']);
const ordinal = z.number().int().positive().max(2147483646);
const roomSchema = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  roomTypeId: stayIdentifierSchema,
  status,
  archivedAt: z.date().nullable(),
});
const typeSchema = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  inventoryMode: inventoryModeSchema,
  capacity: ordinal,
  archivedAt: z.date().nullable(),
});
const seatSchema = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  roomId: stayIdentifierSchema,
  ordinal,
  status,
  archivedAt: z.date().nullable(),
});
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Admission inventory data unavailable');
}
function stored<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) unavailable();
  return parsed.data;
}
// STAY-001 / RES-004 / ACC-001: private operational target lock, never public-listing eligibility.
// Caller first proves live admission grants/identity and locks active branch hierarchy.
// Caller still expires reservations and writes canonical assignment/claim, billing,
// history/audit/outbox in the same transaction. This helper alone does not reserve a seat.
export async function lockResidentAdmissionTarget(tx: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value),
    room = await requireRoom(tx, input.branchId, input.target.roomId),
    roomType = await requireType(tx, input.branchId, room.roomTypeId);
  if (
    (input.target.kind === 'bed' && roomType.inventoryMode === 'whole_room') ||
    (input.target.kind === 'room' && roomType.inventoryMode === 'per_bed')
  )
    throw new DomainError('CONFLICT', 409, 'Inventory mode unavailable');
  if (input.target.kind === 'bed') {
    const seat = await requireSeat(tx, input.branchId, input.target, roomType.capacity);
    return {
      branchId: input.branchId,
      roomTypeId: roomType.id,
      roomId: room.id,
      seatId: seat.id,
      seatOrdinal: seat.ordinal,
    };
  }
  await requireWholeRoom(tx, input.branchId, room.id);
  return {
    branchId: input.branchId,
    roomTypeId: roomType.id,
    roomId: room.id,
    seatId: null,
    seatOrdinal: null,
  };
}
async function requireRoom(tx: PostingTransaction, branchId: string, roomId: string) {
  const [raw] = await tx
    .select()
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId)))
    .for('update');
  if (!raw) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  const room = stored(roomSchema, raw);
  if (room.id !== roomId || room.branchId !== branchId) unavailable();
  if (room.status !== 'active' || room.archivedAt !== null)
    throw new DomainError('CONFLICT', 409, 'Room unavailable');
  return room;
}
async function requireType(tx: PostingTransaction, branchId: string, typeId: string) {
  const [raw] = await tx
    .select()
    .from(roomTypes)
    .where(and(eq(roomTypes.branchId, branchId), eq(roomTypes.id, typeId)))
    .for('update');
  if (!raw) unavailable();
  const type = stored(typeSchema, raw);
  if (type.id !== typeId || type.branchId !== branchId) unavailable();
  if (type.archivedAt !== null)
    throw new DomainError('CONFLICT', 409, 'Inventory mode unavailable');
  return type;
}
async function requireSeat(
  tx: PostingTransaction,
  branchId: string,
  target: Extract<InventoryTarget, { kind: 'bed' }>,
  capacity: number,
) {
  const [raw] = await tx
    .select()
    .from(seats)
    .where(
      and(
        eq(seats.branchId, branchId),
        eq(seats.roomId, target.roomId),
        eq(seats.id, target.bedId),
      ),
    )
    .for('update');
  if (!raw) throw new DomainError('NOT_FOUND', 404, 'Bed unavailable');
  const seat = stored(seatSchema, raw);
  if (
    seat.id !== target.bedId ||
    seat.branchId !== branchId ||
    seat.roomId !== target.roomId ||
    seat.ordinal > capacity
  )
    unavailable();
  if (seat.status !== 'active' || seat.archivedAt !== null)
    throw new DomainError('CONFLICT', 409, 'Bed unavailable');
  return seat;
}
async function requireWholeRoom(tx: PostingTransaction, branchId: string, roomId: string) {
  // Canonical room lock also serializes bed state/archive mutations. Query existence only.
  const unavailableBeds = await tx
    .select({ id: seats.id })
    .from(seats)
    .where(
      and(
        eq(seats.branchId, branchId),
        eq(seats.roomId, roomId),
        isNull(seats.archivedAt),
        or(eq(seats.status, 'inactive'), eq(seats.status, 'maintenance')),
      ),
    )
    .limit(1);
  if (unavailableBeds.length)
    throw new DomainError('CONFLICT', 409, 'Room contains unavailable inventory');
}
