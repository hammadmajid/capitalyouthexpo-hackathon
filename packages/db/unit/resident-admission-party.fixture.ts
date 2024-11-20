import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import type { PostingTransaction } from '../src/resident-posting-context.js';
export const partyIds = {
  organization: randomUUID(),
  branch: randomUUID(),
  actor: randomUUID(),
  resident: randomUUID(),
  user: randomUUID(),
};
export const partyTime = new Date('2028-02-01T06:00:00Z');
export const partyInput = {
  scope: {
    organizationId: partyIds.organization,
    branchId: partyIds.branch,
    actorUserId: partyIds.actor,
    actorRole: 'owner',
  },
  resident: {
    kind: 'new',
    profile: {
      displayName: ' Walk-in Resident ',
      email: ' Resident@EXAMPLE.invalid ',
      phone: '+923001234567',
    },
  },
  expectedUserId: null,
};
export const partyRow = {
  id: partyIds.resident,
  branchId: partyIds.branch,
  userId: null,
  displayName: 'Existing resident',
  archivedAt: null,
};
export function partyFixture(options: { rows?: unknown[]; fail?: unknown } = {}) {
  const writes: { table: unknown; value: unknown }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [];
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
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return Promise.resolve(options.rows ?? [partyRow]).then(resolve, reject);
      },
    };
    return query;
  }
  const tx = {
    select,
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          if (table === options.fail) throw Error('Required relationship write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes, locks, predicates };
}
