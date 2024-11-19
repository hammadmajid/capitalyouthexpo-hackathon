import {
  stayIdentifierSchema as id,
  propertyBuildingInputSchema,
  propertyFloorInputSchema,
  propertyArchiveInputSchema,
  propertyRoomLocationInputSchema,
  propertyBuildingSchema,
  propertyFloorSchema,
  propertyRoomLocationSchema,
} from '@hsm/contracts';
import type { ApiClient } from './client.js';
import { readApi } from './result.js';
import { exactPropertyScope, invalidPropertyResponse } from './property-structure-read.js';
export {
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
} from './property-structure-read.js';
const headers = (key: string) => ({ 'Idempotency-Key': id.parse(key) });
export async function createPropertyBuilding(
  client: ApiClient,
  branchId: string,
  value: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    body = propertyBuildingInputSchema.parse(value);
  const result = exactPropertyScope(
    await readApi(
      client.POST('/v1/branches/{branchId}/property/buildings', {
        params: { path: { branchId: branch }, header: headers(key) },
        body,
      }),
      propertyBuildingSchema,
    ),
    branch,
  );
  if (
    result.name !== body.name ||
    result.sortOrder !== body.sortOrder ||
    result.version !== 1 ||
    result.archivedAt !== null
  )
    invalidPropertyResponse();
  return result;
}
export async function createPropertyFloor(
  client: ApiClient,
  branchId: string,
  value: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    body = propertyFloorInputSchema.parse(value);
  const result = exactPropertyScope(
    await readApi(
      client.POST('/v1/branches/{branchId}/property/floors', {
        params: { path: { branchId: branch }, header: headers(key) },
        body,
      }),
      propertyFloorSchema,
    ),
    branch,
  );
  if (
    result.buildingId !== body.buildingId ||
    result.label !== body.label ||
    result.levelNumber !== body.levelNumber ||
    result.version !== 1 ||
    result.archivedAt !== null
  )
    invalidPropertyResponse();
  return result;
}
export async function archivePropertyBuilding(
  client: ApiClient,
  branchId: string,
  buildingId: string,
  value: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    building = id.parse(buildingId),
    body = propertyArchiveInputSchema.parse(value);
  const result = exactPropertyScope(
    await readApi(
      client.POST('/v1/branches/{branchId}/property/buildings/{buildingId}/archive', {
        params: { path: { branchId: branch, buildingId: building }, header: headers(key) },
        body,
      }),
      propertyBuildingSchema,
    ),
    branch,
  );
  if (
    result.id !== building ||
    result.version !== body.expectedVersion + 1 ||
    result.archivedAt === null
  )
    invalidPropertyResponse();
  return result;
}
export async function archivePropertyFloor(
  client: ApiClient,
  branchId: string,
  floorId: string,
  value: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    floor = id.parse(floorId),
    body = propertyArchiveInputSchema.parse(value);
  const result = exactPropertyScope(
    await readApi(
      client.POST('/v1/branches/{branchId}/property/floors/{floorId}/archive', {
        params: { path: { branchId: branch, floorId: floor }, header: headers(key) },
        body,
      }),
      propertyFloorSchema,
    ),
    branch,
  );
  if (
    result.id !== floor ||
    result.version !== body.expectedVersion + 1 ||
    result.archivedAt === null
  )
    invalidPropertyResponse();
  return result;
}
export async function savePropertyRoomLocation(
  client: ApiClient,
  branchId: string,
  roomId: string,
  value: unknown,
  key: string,
) {
  const branch = id.parse(branchId),
    room = id.parse(roomId),
    body = propertyRoomLocationInputSchema.parse(value);
  const result = exactPropertyScope(
    await readApi(
      client.PUT('/v1/branches/{branchId}/property/rooms/{roomId}/location', {
        params: { path: { branchId: branch, roomId: room }, header: headers(key) },
        body,
      }),
      propertyRoomLocationSchema,
    ),
    branch,
  );
  if (
    result.roomId !== room ||
    result.version !== body.expectedVersion + 1 ||
    (result.floor?.id ?? null) !== body.floorId
  )
    invalidPropertyResponse();
  return result;
}
