import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
import { branches, residentInvoices, stays } from '@hsm/db';
import type { Transaction } from '../../src/audit/writer.js';

export type Candidate = {
  id: string;
  branchId: string;
  stayId: string;
  due: string;
  resident: string;
  number: string;
  state: string;
  matching: boolean;
};
// Query double respects the actual requested ceiling and continuation ID. Real
// PostgreSQL suites verify joins, branch scope and calendar predicates separately.
export function reportCandidatesFixture(rows: Candidate[], branchId: string) {
  const predicates: SQL[] = [];
  const limits: number[] = [];
  function select() {
    let table: unknown,
      limit = Number.MAX_SAFE_INTEGER,
      predicate: SQL | undefined;
    const query = {
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin() {
        return query;
      },
      where(value: SQL) {
        predicate = value;
        predicates.push(value);
        return query;
      },
      orderBy() {
        return query;
      },
      limit(value: number) {
        limit = value;
        limits.push(value);
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        if (table === branches)
          return Promise.resolve([{ id: branchId, name: 'Scoped branch' }]).then(resolve, reject);
        if (table !== residentInvoices && table !== stays) throw new Error('Unexpected table');
        const params = predicate ? new PgDialect().sqlToQuery(predicate).params : [];
        const cursor = rows.findIndex((row) => params.includes(row.id));
        return Promise.resolve(rows.slice(cursor + 1, cursor + 1 + limit)).then(resolve, reject);
      },
    };
    return query;
  }
  return { transaction: { select } as unknown as Transaction, predicates, limits };
}
