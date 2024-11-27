import type { ApiClient } from '@hsm/api-client';
import { readBranchOccupancy } from '@hsm/api-client';
import type { OccupancyPage } from '@hsm/contracts';
// BRN-001 / BED-001: hierarchy totals use every authorized occupancy page.
export async function readPropertyOccupancy(client: ApiClient, branchId: string) {
  const rooms: OccupancyPage['data'] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (;;) {
    const page = await readBranchOccupancy(client, branchId, {
      limit: 50,
      ...(cursor ? { cursor } : {}),
    });
    for (const room of page.data) {
      if (seen.has(room.id)) throw new Error('Duplicate occupancy room');
      seen.add(room.id);
      rooms.push(room);
    }
    if (!page.nextCursor) return rooms;
    if (page.nextCursor === cursor || !page.data.length)
      throw new Error('Occupancy continuation unavailable');
    cursor = page.nextCursor;
  }
}
export function occupiedInRooms(rooms: OccupancyPage['data'], ids: readonly string[]) {
  const selected = new Set(ids);
  return rooms
    .filter((room) => selected.has(room.id))
    .reduce((sum, room) => sum + room.beds.filter((bed) => bed.state === 'occupied').length, 0);
}
