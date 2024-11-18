import { z } from 'zod';
import {
  inventoryAccessSchema,
  inventoryPageQuerySchema,
  inventoryPageSequenceIsValid,
  inventoryRoomTypePageSchema,
  inventoryRoomPageSchema,
  inventorySeatPageSchema,
  type InventoryPageQuery,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
function queryOf(input: unknown) {
  const parsed = inventoryPageQuerySchema.parse(input);
  return { limit: parsed.limit, ...(parsed.cursor ? { cursor: parsed.cursor } : {}) };
}
function verifyPage<
  T extends { branchId: string; data: { id: string }[]; nextCursor: string | null },
>(value: T, branchId: string, query: InventoryPageQuery) {
  if (
    value.branchId !== branchId ||
    value.data.length > query.limit ||
    (value.nextCursor !== null && value.data.length !== query.limit) ||
    !inventoryPageSequenceIsValid(value.data, query.cursor)
  )
    throw new ClientFailure('INVALID_RESPONSE');
  return value;
}
export async function listInventoryRoomTypes(
  client: ApiClient,
  branchId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    query = queryOf(input);
  return verifyPage(
    await readApi(
      client.GET('/v1/branches/{branchId}/inventory/pages/room-types', {
        params: { path: { branchId: branch }, query },
      }),
      inventoryRoomTypePageSchema,
    ),
    branch,
    query,
  );
}
export async function listInventoryRooms(
  client: ApiClient,
  branchId: string,
  roomTypeId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    parent = id.parse(roomTypeId),
    query = queryOf(input);
  const result = verifyPage(
    await readApi(
      client.GET('/v1/branches/{branchId}/inventory/pages/room-types/{roomTypeId}/rooms', {
        params: { path: { branchId: branch, roomTypeId: parent }, query },
      }),
      inventoryRoomPageSchema,
    ),
    branch,
    query,
  );
  if (result.roomTypeId !== parent) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
export async function listInventoryBeds(
  client: ApiClient,
  branchId: string,
  roomId: string,
  input: unknown = {},
) {
  const branch = id.parse(branchId),
    parent = id.parse(roomId),
    query = queryOf(input);
  const result = verifyPage(
    await readApi(
      client.GET('/v1/branches/{branchId}/inventory/pages/rooms/{roomId}/seats', {
        params: { path: { branchId: branch, roomId: parent }, query },
      }),
      inventorySeatPageSchema,
    ),
    branch,
    query,
  );
  if (result.roomId !== parent) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}

export async function readInventoryAccess(client: ApiClient, branchId: string) {
  const branch = id.parse(branchId);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/inventory/pages/access', {
      params: { path: { branchId: branch } },
    }),
    inventoryAccessSchema,
  );
  if (result.branchId !== branch) throw new ClientFailure('INVALID_RESPONSE');
  return result;
}
