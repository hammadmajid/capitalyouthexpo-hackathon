import {
  stayIdentifierSchema as id,
  propertyPageQuerySchema,
  propertyBuildingPageSchema,
  propertyFloorPageSchema,
  propertyRoomLocationSchema,
  inventoryPageSequenceIsValid,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { ClientFailure, readApi } from './result.js';

export function invalidPropertyResponse(): never {
  throw new ClientFailure('INVALID_RESPONSE');
}
export function exactPropertyScope<T extends { branchId: string }>(result: T, branchId: string) {
  return result.branchId === branchId ? result : invalidPropertyResponse();
}
function pageScope<T extends { id: string; branchId: string }>(
  result: { branchId: string; data: T[]; nextCursor: string | null },
  branchId: string,
  query: { limit: number; cursor?: string | undefined },
) {
  if (
    result.branchId !== branchId ||
    result.data.some((row) => row.branchId !== branchId) ||
    result.data.length > query.limit ||
    !inventoryPageSequenceIsValid(result.data, query.cursor) ||
    (result.nextCursor !== null &&
      (result.data.length !== query.limit || result.nextCursor !== result.data.at(-1)?.id))
  )
    invalidPropertyResponse();
}
function queryInput(value: unknown) {
  return propertyPageQuerySchema.omit({ buildingId: true }).parse(value);
}
function queryFields(query: ReturnType<typeof queryInput>) {
  return {
    limit: query.limit,
    view: query.view,
    ...(query.cursor ? { cursor: query.cursor } : {}),
    ...(query.search ? { search: query.search } : {}),
  };
}
export async function readPropertyBuildings(
  client: ApiClient,
  branchId: string,
  value: unknown = {},
) {
  const branch = id.parse(branchId),
    query = queryInput(value);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/property/buildings', {
      params: { path: { branchId: branch }, query: queryFields(query) },
    }),
    propertyBuildingPageSchema,
  );
  pageScope(result, branch, query);
  return result;
}
export async function readPropertyFloors(
  client: ApiClient,
  branchId: string,
  buildingId: string,
  value: unknown = {},
) {
  const branch = id.parse(branchId),
    building = id.parse(buildingId),
    query = queryInput(value);
  const result = await readApi(
    client.GET('/v1/branches/{branchId}/property/floors', {
      params: {
        path: { branchId: branch },
        query: { ...queryFields(query), buildingId: building },
      },
    }),
    propertyFloorPageSchema,
  );
  pageScope(result, branch, query);
  if (result.buildingId !== building || result.data.some((row) => row.buildingId !== building))
    invalidPropertyResponse();
  return result;
}
export async function readPropertyRoomLocation(
  client: ApiClient,
  branchId: string,
  roomId: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomId);
  const result = exactPropertyScope(
    await readApi(
      client.GET('/v1/branches/{branchId}/property/rooms/{roomId}/location', {
        params: { path: { branchId: branch, roomId: room } },
      }),
      propertyRoomLocationSchema,
    ),
    branch,
  );
  return result.roomId === room ? result : invalidPropertyResponse();
}
