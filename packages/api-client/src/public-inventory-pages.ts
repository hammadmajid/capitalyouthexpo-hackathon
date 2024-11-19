import { z } from 'zod';
import {
  inventoryPageSequenceIsValid,
  publicInventoryQuerySchema,
  publicInventoryTypePageSchema,
  publicInventoryRoomPageSchema,
  publicInventoryBedPageSchema,
  type PublicInventoryQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function queryOf(value: unknown) {
  const query = publicInventoryQuerySchema.parse(value);
  return {
    limit: query.limit,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.moveInDate && query.moveOutDate
      ? { moveInDate: query.moveInDate, moveOutDate: query.moveOutDate }
      : {}),
  };
}
function verify<T extends { branchId: string; data: { id: string }[]; nextCursor: string | null }>(
  value: T,
  branchId: string,
  query: PublicInventoryQuery,
) {
  if (
    value.branchId !== branchId ||
    value.data.length > query.limit ||
    (value.nextCursor !== null && value.data.length !== query.limit) ||
    !inventoryPageSequenceIsValid(value.data, query.cursor)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export { marketplaceDetails as marketplaceOverview } from './marketplace.js';
export async function listPublicInventoryRoomTypes(
  client: ApiClient,
  branchId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    query = queryOf(input);
  return verify(
    await readApi(
      client.GET('/v1/marketplace/{branchId}/inventory/pages/room-types', {
        params: { path: { branchId: branch }, query },
      }),
      publicInventoryTypePageSchema,
    ),
    branch,
    query,
  );
}
export async function listPublicInventoryRooms(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    parent = id.parse(roomTypeId),
    query = queryOf(input);
  const value = verify(
    await readApi(
      client.GET('/v1/marketplace/{branchId}/inventory/pages/room-types/{roomTypeId}/rooms', {
        params: { path: { branchId: branch, roomTypeId: parent }, query },
      }),
      publicInventoryRoomPageSchema,
    ),
    branch,
    query,
  );
  if (
    value.roomTypeId !== parent ||
    value.data.some((row) =>
      query.moveInDate === undefined
        ? row.wholeRoomAvailable === true
        : row.wholeRoomAvailable === null,
    )
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export async function listPublicInventoryBeds(
  client: ApiClient,
  branchId: string,
  roomId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    parent = id.parse(roomId),
    query = queryOf(input);
  const value = verify(
    await readApi(
      client.GET('/v1/marketplace/{branchId}/inventory/pages/rooms/{roomId}/beds', {
        params: { path: { branchId: branch, roomId: parent }, query },
      }),
      publicInventoryBedPageSchema,
    ),
    branch,
    query,
  );
  if (
    value.roomId !== parent ||
    value.data.some((row) => (row.available === null) !== (query.moveInDate === undefined))
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
