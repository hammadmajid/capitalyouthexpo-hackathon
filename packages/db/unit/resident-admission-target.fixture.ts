import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { rooms, roomTypes, seats } from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
export const targetIds = {
  branch: randomUUID(),
  type: randomUUID(),
  room: randomUUID(),
  seat: randomUUID(),
};
export const targetInput = {
  branchId: targetIds.branch,
  target: { kind: 'bed', roomId: targetIds.room, bedId: targetIds.seat },
};
export const targetRoom = {
  id: targetIds.room,
  branchId: targetIds.branch,
  roomTypeId: targetIds.type,
  status: 'active',
  archivedAt: null,
};
export const targetType = {
  id: targetIds.type,
  branchId: targetIds.branch,
  inventoryMode: 'both',
  capacity: 2,
  archivedAt: null,
};
export const targetSeat = {
  id: targetIds.seat,
  branchId: targetIds.branch,
  roomId: targetIds.room,
  ordinal: 1,
  status: 'active',
  archivedAt: null,
};
export function targetFixture(
  options: { rooms?: unknown[]; types?: unknown[]; seats?: unknown[] } = {},
) {
  const rows = new Map<unknown, unknown[]>([
    [rooms, options.rooms ?? [targetRoom]],
    [roomTypes, options.types ?? [targetType]],
    [seats, options.seats ?? [targetSeat]],
  ]);
  const locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [],
    limits: number[] = [];
  function select() {
    let table: unknown;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return query;
      },
      for(mode: string) {
        locks.push({ table, mode });
        return query;
      },
      limit(value: number) {
        limits.push(value);
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  return { tx: { select } as unknown as PostingTransaction, locks, predicates, limits };
}
