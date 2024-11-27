import { useQuery } from '@tanstack/react-query';
import { readBranchOccupancy } from '@hsm/api-client';
import { actorClient } from '../lib/runtime';
import type { BoardRoom } from './bed-board-model';
// 50 rooms per page x 20 pages covers any single branch; a longer branch shows a notice
// instead of silently hiding rooms.
const pageLimit = 50,
  maxPages = 20;
// BED-001 / CHG-048: the whole branch from the authoritative occupancy read (today, with
// server rent status). Every caller shares the 'bed-board' key, so admissions, payments
// and transfers that already invalidate it repaint the circles automatically.
export function useBedBoard(actorId: string, branchId: string) {
  return useQuery({
    queryKey: ['bed-board', actorId, branchId, 'visual'],
    gcTime: 0,
    retry: false,
    refetchInterval: 60_000,
    queryFn: async () => {
      const client = await actorClient(actorId);
      const rooms: BoardRoom[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < maxPages; page += 1) {
        const result = await readBranchOccupancy(client, branchId, {
          limit: pageLimit,
          ...(cursor ? { cursor } : {}),
        });
        rooms.push(...result.data);
        cursor = result.nextCursor ?? undefined;
        if (!cursor) return { rooms, complete: true };
      }
      return { rooms, complete: false };
    },
  });
}
