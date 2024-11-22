import { z } from 'zod';
import { and, eq, inArray } from 'drizzle-orm';
import { amenities, roomAmenities, roomTypeAmenities } from '@hsm/db';
import { DomainError, publicRoomAmenityListSchema, publicRoomAmenitySchema } from '@hsm/contracts';
import type { Transaction } from '../audit/writer.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
type Selected = z.infer<typeof publicRoomAmenityListSchema>;
const unavailable = () => new DomainError('INTERNAL', 500, 'Room amenities unavailable');
// One bounded association query for the actual types in a detail response, never per room.
export async function publicRoomAmenities(
  transaction: Transaction,
  branchId: string,
  roomTypeIds: string[],
) {
  const selected = new Map<string, Selected>(),
    ids = z.array(id).parse(roomTypeIds),
    expected = new Set(ids);
  if (expected.size !== ids.length) throw unavailable();
  if (!ids.length) return selected;
  const rows = await transaction
    .select({
      roomTypeId: roomTypeAmenities.roomTypeId,
      code: amenities.code,
      name: amenities.name,
    })
    .from(roomTypeAmenities)
    .innerJoin(amenities, eq(amenities.code, roomTypeAmenities.amenityCode))
    .where(
      and(
        eq(roomTypeAmenities.branchId, branchId),
        inArray(roomTypeAmenities.roomTypeId, ids),
        eq(amenities.isActive, true),
      ),
    )
    .orderBy(roomTypeAmenities.roomTypeId, amenities.code)
    .limit(ids.length * 100 + 1);
  const parsed = z
    .array(publicRoomAmenitySchema.extend({ roomTypeId: id }).strict())
    .max(ids.length * 100)
    .safeParse(rows);
  if (!parsed.success) throw unavailable();
  for (const row of parsed.data) {
    if (!expected.has(row.roomTypeId)) throw unavailable();
    const current = selected.get(row.roomTypeId) ?? [];
    current.push({ code: row.code, name: row.name });
    selected.set(row.roomTypeId, current);
  }
  for (const [roomTypeId, values] of selected) {
    const valid = publicRoomAmenityListSchema.safeParse(values);
    if (!valid.success) throw unavailable();
    selected.set(roomTypeId, valid.data);
  }
  return selected;
}
// ROOM-AMN (SRS v2.15): own sets for customized rooms on one page; one bounded query.
export async function publicOwnRoomAmenities(
  transaction: Transaction,
  branchId: string,
  roomIds: string[],
) {
  const selected = new Map<string, Selected>(),
    ids = z.array(id).parse(roomIds),
    expected = new Set(ids);
  if (expected.size !== ids.length) throw unavailable();
  if (!ids.length) return selected;
  const rows = await transaction
    .select({ roomId: roomAmenities.roomId, code: amenities.code, name: amenities.name })
    .from(roomAmenities)
    .innerJoin(amenities, eq(amenities.code, roomAmenities.amenityCode))
    .where(
      and(
        eq(roomAmenities.branchId, branchId),
        inArray(roomAmenities.roomId, ids),
        eq(amenities.isActive, true),
      ),
    )
    .orderBy(roomAmenities.roomId, amenities.code)
    .limit(ids.length * 100 + 1);
  const parsed = z
    .array(publicRoomAmenitySchema.extend({ roomId: id }).strict())
    .max(ids.length * 100)
    .safeParse(rows);
  if (!parsed.success) throw unavailable();
  for (const row of parsed.data) {
    if (!expected.has(row.roomId)) throw unavailable();
    const current = selected.get(row.roomId) ?? [];
    current.push({ code: row.code, name: row.name });
    selected.set(row.roomId, current);
  }
  for (const [roomId, values] of selected) {
    const valid = publicRoomAmenityListSchema.safeParse(values);
    if (!valid.success) throw unavailable();
    selected.set(roomId, valid.data);
  }
  return selected;
}
