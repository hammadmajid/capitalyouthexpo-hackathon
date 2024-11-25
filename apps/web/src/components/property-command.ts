'use client';
import {
  createPropertyBuilding,
  createPropertyFloor,
  archivePropertyBuilding,
  archivePropertyFloor,
  savePropertyRoomLocation,
  ApiFailure,
} from '@hsm/api-client';
import type {
  PropertyArchiveInput,
  PropertyBuildingInput,
  PropertyFloorInput,
  PropertyRoomLocationInput,
} from '@hsm/contracts';
import { browserClient } from '../lib/client';
import { useCommand } from './services/use-command';
import { inventoryScopeDenied } from './use-branch-inventory';
export const propertyScopeDenied = (error: unknown) =>
  inventoryScopeDenied(error) || (error instanceof ApiFailure && error.code === 'NOT_FOUND');
export type PropertyCommand =
  | { kind: 'building'; input: PropertyBuildingInput }
  | { kind: 'floor'; input: PropertyFloorInput }
  | { kind: 'archive-building' | 'archive-floor'; id: string; input: PropertyArchiveInput }
  | { kind: 'location'; id: string; input: PropertyRoomLocationInput };
export function usePropertyCommand(actorId: string, branchId: string, roomId?: string) {
  return useCommand<PropertyCommand>(
    'property-metadata',
    async (body, key) => {
      const client = browserClient();
      switch (body.kind) {
        case 'building':
          return createPropertyBuilding(client, branchId, body.input, key);
        case 'floor':
          return createPropertyFloor(client, branchId, body.input, key);
        case 'archive-building':
          return archivePropertyBuilding(client, branchId, body.id, body.input, key);
        case 'archive-floor':
          return archivePropertyFloor(client, branchId, body.id, body.input, key);
        case 'location':
          return savePropertyRoomLocation(client, branchId, body.id, body.input, key);
      }
    },
    [
      ['property-command', actorId, branchId, roomId ?? 'hierarchy'],
      ['property-pages', actorId, branchId],
      ['property-room-location', actorId, branchId],
      ['report-options', actorId, branchId],
    ],
  );
}
