import { randomUUID } from 'node:crypto';
import type { SQL } from 'drizzle-orm';
import { stays, residentLedger } from '../src/schema/index.js';
import type { PostingTransaction } from '../src/resident-posting-context.js';
export const fundScope = { branchId: randomUUID(), stayId: randomUUID() };
export const fundTotals = {
  depositReceived: '1001',
  depositApplied: '200',
  depositDeducted: '100',
  depositRefunded: '300',
  advanceReceived: '500',
  advanceApplied: '100',
  advanceRefunded: '50',
};
export function fundFixture(
  options: { stay?: unknown[]; totals?: unknown[]; fail?: unknown } = {},
) {
  const rows = new Map<unknown, unknown[]>([
    [stays, options.stay ?? [{ id: fundScope.stayId, branchId: fundScope.branchId }]],
    [residentLedger, options.totals ?? [fundTotals]],
  ]);
  const predicates: { table: unknown; value: SQL }[] = [],
    locks: { table: unknown; mode: string }[] = [],
    joins: { table: unknown; value: SQL; kind: string }[] = [],
    fields: unknown[] = [];
  function select(input: unknown) {
    fields.push(input);
    let table: unknown;
    const query = {
      orderBy() {
        return query;
      },
      groupBy() {
        return query;
      },
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin(value: unknown, condition: SQL) {
        joins.push({ table: value, value: condition, kind: 'inner' });
        return query;
      },
      leftJoin(value: unknown, condition: SQL) {
        joins.push({ table: value, value: condition, kind: 'left' });
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
        if (table === options.fail)
          return Promise.reject(new Error('Fund aggregate unavailable')).then(resolve, reject);
        return Promise.resolve(rows.get(table) ?? []).then(resolve, reject);
      },
    };
    return query;
  }
  return { tx: { select } as unknown as PostingTransaction, predicates, locks, joins, fields };
}
