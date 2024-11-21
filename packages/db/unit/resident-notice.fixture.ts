import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { stays, stayAgreements } from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
import { rentIds, rentTime, rentStay, rentAgreement } from './resident-rent.fixture.js';
export const noticeIds = {
  ...rentIds,
  organization: randomUUID(),
  user: randomUUID(),
};
export const noticeTime = rentTime;
export const noticeCommand = {
  scope: {
    branchId: noticeIds.branch,
    stayId: noticeIds.stay,
    actorUserId: noticeIds.actor,
    actorRole: 'owner',
  },
  notice: {
    expectedVersion: 1,
    requestedCheckoutDate: '2028-02-10',
    isEmergency: false,
  },
};
type NoticeFixtureOptions = {
  stay?: Record<string, unknown>;
  missingStay?: boolean;
  agreement?: Record<string, unknown>;
  missingAgreement?: boolean;
  updated?: unknown[];
  fail?: unknown;
};
export function noticeFixture(options: NoticeFixtureOptions = {}) {
  const rows = noticeRows(options);
  const writes: { table: unknown; value: unknown }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    predicates: { table: unknown; value: SQL }[] = [];
  const tx = {
    select: () => noticeQuery(rows, locks, predicates),
    update(table: unknown) {
      return {
        set(value: unknown) {
          writes.push({ table, value });
          return {
            where(value: SQL) {
              predicates.push({ table, value });
              return {
                returning: async () => options.updated ?? [{ id: noticeIds.stay, version: 2 }],
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        async values(value: unknown) {
          if (table === options.fail) throw Error('Required notice write failed');
          writes.push({ table, value });
        },
      };
    },
  };
  return { tx: tx as unknown as PostingTransaction, writes, locks, predicates };
}
function noticeQuery(
  rows: Map<unknown, unknown[]>,
  locks: { table: unknown; mode: string }[],
  predicates: { table: unknown; value: SQL }[],
) {
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
    orderBy() {
      return query;
    },
    limit() {
      return query;
    },
    then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
      return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
    },
  };
  return query;
}

function noticeRows(options: NoticeFixtureOptions) {
  return new Map<unknown, unknown[]>([
    [
      stays,
      options.missingStay
        ? []
        : [
            {
              ...rentStay({ state: 'active', checkedInAt: rentTime }),
              ...options.stay,
            },
          ],
    ],
    [
      stayAgreements,
      options.missingAgreement ? [] : [{ ...rentAgreement(), ...options.agreement }],
    ],
  ]);
}
