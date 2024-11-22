import { amenityScope } from './amenity-scope.js';
import { createHash } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { amenities, roomTypeAmenities, roomTypes } from '@hsm/db';
import {
  DomainError,
  roomAmenitiesInputSchema,
  roomAmenitiesStateSchema,
  type RoomAmenitiesInput,
  type RoomAmenitiesState,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Selected = RoomAmenitiesState['amenities'];
export async function lockAmenityRoom(
  transaction: Transaction,
  branchId: string,
  roomTypeId: string,
) {
  const [row] = await transaction
    .select({ id: roomTypes.id })
    .from(roomTypes)
    .where(
      and(
        eq(roomTypes.branchId, branchId),
        eq(roomTypes.id, roomTypeId),
        isNull(roomTypes.archivedAt),
      ),
    )
    .limit(1)
    .for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Room type unavailable');
}
export async function readRoomAmenities(
  transaction: Transaction,
  branchId: string,
  roomTypeId: string,
) {
  const rows = await transaction
    .select({ code: amenities.code, name: amenities.name, isActive: amenities.isActive })
    .from(roomTypeAmenities)
    .innerJoin(amenities, eq(amenities.code, roomTypeAmenities.amenityCode))
    .where(
      and(eq(roomTypeAmenities.branchId, branchId), eq(roomTypeAmenities.roomTypeId, roomTypeId)),
    )
    .orderBy(amenities.code)
    .limit(101)
    .for('share');
  if (rows.length > 100)
    throw new DomainError(
      'CONFLICT',
      409,
      'Room amenity configuration exceeds the supported association limit',
    );
  return rows;
}
export function projectRoomAmenities(
  branchId: string,
  roomTypeId: string,
  selected: Selected,
  canEdit: boolean,
) {
  const sorted = [...selected].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  const fields = {
    branchId: branchId.toLowerCase(),
    roomTypeId: roomTypeId.toLowerCase(),
    amenities: sorted,
    canEdit,
  };
  const version = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return roomAmenitiesStateSchema.parse({ ...fields, version });
}
export async function requireRoomAmenityCodes(
  transaction: Transaction,
  input: RoomAmenitiesInput,
  selected: Selected,
  branchId?: string,
) {
  const codes = roomAmenitiesInputSchema.parse(input).amenityCodes;
  if (!codes.length) return;
  const rows = await transaction
    .select({ code: amenities.code, isActive: amenities.isActive })
    .from(amenities)
    .where(and(inArray(amenities.code, codes), amenityScope(transaction, branchId)))
    .orderBy(amenities.code)
    .for('share');
  const existing = new Set(selected.map((row) => row.code));
  if (
    rows.length !== codes.length ||
    rows.some((row) => !row.isActive && !existing.has(row.code))
  ) {
    throw new DomainError('VALIDATION_FAILED', 400, 'Choose approved amenity codes');
  }
}
