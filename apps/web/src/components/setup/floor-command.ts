import {
  attachListingImage,
  createInventoryBed,
  createPropertyBuilding,
  createPropertyFloor,
  createSetupRoom,
  savePropertyRoomLocation,
  type ApiClient,
} from '@hsm/api-client';
import type { SeatInput, SetupRoomInput } from '@hsm/contracts';
// One command shape for every Building → Floor → Room → Bed write (mobile use-floor-rooms).
export type FloorCommand =
  | { kind: 'building'; name: string; sortOrder: number }
  | { kind: 'floor'; buildingId: string; label: string; levelNumber: number }
  | { kind: 'setup_room'; input: SetupRoomInput }
  | { kind: 'bed'; roomId: string; input: SeatInput }
  | { kind: 'locate'; roomId: string; floorId: string; expectedVersion: number }
  | { kind: 'photo'; fileId: string; altText: string; roomId: string; bedId?: string };
export function runFloorCommand(
  client: ApiClient,
  branchId: string,
  body: FloorCommand,
  key: string,
) {
  switch (body.kind) {
    case 'building':
      return createPropertyBuilding(
        client,
        branchId,
        { name: body.name, sortOrder: body.sortOrder },
        key,
      );
    case 'floor':
      return createPropertyFloor(
        client,
        branchId,
        { buildingId: body.buildingId, label: body.label, levelNumber: body.levelNumber },
        key,
      );
    // CHG-057 / ROOM-002: a room starts empty; its size comes from the beds added to it.
    case 'setup_room':
      return createSetupRoom(client, branchId, body.input, key);
    case 'bed':
      return createInventoryBed(client, branchId, body.roomId, body.input, key);
    case 'locate':
      return savePropertyRoomLocation(
        client,
        branchId,
        body.roomId,
        {
          floorId: body.floorId,
          expectedVersion: body.expectedVersion,
          reason: 'Room placed on its floor during setup',
        },
        key,
      );
    case 'photo':
      return attachListingImage(
        client,
        branchId,
        {
          fileId: body.fileId,
          altText: body.altText,
          sortOrder: 0,
          target: body.bedId
            ? { kind: 'bed', roomId: body.roomId, bedId: body.bedId }
            : { kind: 'room', roomId: body.roomId },
        },
        key,
      );
  }
}
