import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { amenities, roomAmenities, rooms } from '@hsm/db';
import {
  DomainError,
  roomLevelAmenitiesStateSchema,
  type RoomAmenitiesState,
} from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
type Selected = RoomAmenitiesState['amenities'];
// ROOM-AMN (SRS v2.15): lock the live room so a concurrent edit cannot interleave.
export async function lockAmenityRoomRecord(
  transaction: Transaction,
  branchId: string,
  roomId: string,
) {
  const [row] = await transaction
    .select({ roomTypeId: rooms.roomTypeId, customized: rooms.amenitiesCustomized })
    .from(rooms)
    .where(and(eq(rooms.branchId, branchId), eq(rooms.id, roomId), isNull(rooms.archivedAt)))
    .limit(1)
    .for('update');
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Room unavailable');
  return row;
}
export async function readOwnRoomAmenities(
  transaction: Transaction,
  branchId: string,
  roomId: string,
) {
  const rows = await transaction
    .select({ code: amenities.code, name: amenities.name, isActive: amenities.isActive })
    .from(roomAmenities)
    .innerJoin(amenities, eq(amenities.code, roomAmenities.amenityCode))
    .where(and(eq(roomAmenities.branchId, branchId), eq(roomAmenities.roomId, roomId)))
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
const byCode = (rows: Selected) =>
  [...rows].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
export function projectRoomLevelAmenities(input: {
  branchId: string;
  roomId: string;
  roomTypeId: string;
  customized: boolean;
  own: Selected;
  type: Selected;
  canEdit: boolean;
}) {
  const typeAmenities = byCode(input.type);
  const fields = {
    branchId: input.branchId.toLowerCase(),
    roomId: input.roomId.toLowerCase(),
    roomTypeId: input.roomTypeId.toLowerCase(),
    customized: input.customized,
    amenities: input.customized ? byCode(input.own) : typeAmenities,
    typeAmenities,
    canEdit: input.canEdit,
  };
  const version = createHash('sha256').update(JSON.stringify(fields)).digest('hex');
  return roomLevelAmenitiesStateSchema.parse({ ...fields, version });
}
