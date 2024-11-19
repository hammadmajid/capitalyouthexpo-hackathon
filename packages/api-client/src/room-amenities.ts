import { z } from 'zod';
import {
  listingVersionSchema,
  roomAmenitiesInputSchema,
  roomAmenitiesStateSchema,
  roomLevelAmenitiesInputSchema,
  roomLevelAmenitiesStateSchema,
  type RoomAmenitiesState,
  type RoomLevelAmenitiesState,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function sameScope(result: RoomAmenitiesState, branchId: string, roomTypeId: string) {
  if (result.branchId !== branchId || result.roomTypeId !== roomTypeId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readRoomTypeAmenities(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomTypeId);
  return sameScope(
    await readApi(
      client.GET('/v1/branches/{branchId}/room-types/{roomTypeId}/amenities', {
        params: { path: { branchId: branch, roomTypeId: room } },
      }),
      roomAmenitiesStateSchema,
    ),
    branch,
    room,
  );
}
export async function saveRoomTypeAmenities(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomTypeId),
    expectedVersion = listingVersionSchema.parse(version),
    commandKey = id.parse(key);
  const parsed = roomAmenitiesInputSchema.parse(input),
    body = { amenityCodes: [...parsed.amenityCodes].sort() };
  const result = sameScope(
    await readApi(
      client.PUT('/v1/branches/{branchId}/room-types/{roomTypeId}/amenities', {
        params: {
          path: { branchId: branch, roomTypeId: room },
          header: { 'If-Match': '"' + expectedVersion + '"', 'Idempotency-Key': commandKey },
        },
        body,
      }),
      roomAmenitiesStateSchema,
    ),
    branch,
    room,
  );
  const actual = result.amenities.map((row) => row.code).sort();
  if (!result.canEdit || JSON.stringify(actual) !== JSON.stringify(body.amenityCodes))
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
// ROOM-AMN (SRS v2.15): one room's effective amenities (inherited or its own set).
function sameRoom(result: RoomLevelAmenitiesState, branchId: string, roomId: string) {
  if (result.branchId !== branchId || result.roomId !== roomId)
    throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function readRoomLevelAmenities(client: ApiClient, branchId: string, roomId: string) {
  const branch = id.parse(branchId),
    room = id.parse(roomId);
  return sameRoom(
    await readApi(
      client.GET('/v1/branches/{branchId}/rooms/{roomId}/amenities', {
        params: { path: { branchId: branch, roomId: room } },
      }),
      roomLevelAmenitiesStateSchema,
    ),
    branch,
    room,
  );
}
export async function saveRoomLevelAmenities(
  client: ApiClient,
  branchId: string,
  roomId: string,
  version: string,
  input: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomId),
    expectedVersion = listingVersionSchema.parse(version),
    commandKey = id.parse(key),
    parsed = roomLevelAmenitiesInputSchema.parse(input);
  const body =
    parsed.mode === 'custom'
      ? { mode: 'custom' as const, amenityCodes: [...parsed.amenityCodes].sort() }
      : parsed;
  const result = sameRoom(
    await readApi(
      client.PUT('/v1/branches/{branchId}/rooms/{roomId}/amenities', {
        params: {
          path: { branchId: branch, roomId: room },
          header: { 'If-Match': '"' + expectedVersion + '"', 'Idempotency-Key': commandKey },
        },
        body,
      }),
      roomLevelAmenitiesStateSchema,
    ),
    branch,
    room,
  );
  if (result.customized !== (body.mode === 'custom')) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
