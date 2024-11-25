import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  readPropertyBuildings,
  readPropertyFloors,
  readPropertyRoomLocation,
} from '@hsm/api-client';
export const branch = randomUUID(),
  buildingId = randomUUID(),
  floorId = randomUUID(),
  roomId = randomUUID();
export const building = {
  id: buildingId,
  branchId: branch,
  name: 'Actual block',
  sortOrder: 0,
  version: 1,
  archivedAt: null,
};
export const floor = {
  id: floorId,
  branchId: branch,
  buildingId,
  label: 'Ground',
  levelNumber: 0,
  version: 1,
  archivedAt: null,
};
export const location = {
  branchId: branch,
  roomId,
  roomLabel: '101',
  version: 1,
  canEdit: true,
  archivedAt: null,
  floor: null,
};
export function propertyFixture() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  vi.mocked(readPropertyBuildings).mockResolvedValue({
    branchId: branch,
    canEdit: true,
    data: [building],
    nextCursor: null,
  });
  vi.mocked(readPropertyFloors).mockResolvedValue({
    branchId: branch,
    buildingId,
    canEdit: true,
    data: [floor],
    nextCursor: null,
  });
  vi.mocked(readPropertyRoomLocation).mockResolvedValue(location);
  return { actorId: randomUUID(), cache };
}
