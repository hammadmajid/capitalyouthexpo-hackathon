import type { SQL } from 'drizzle-orm';
import type { Database } from '@hsm/db';
import type { Transaction } from '../../src/audit/writer.js';
// Unit-only query double. PostgreSQL constraints/locks remain real Testcontainers checks.
export function queryFixture() {
  const rows = new Map<unknown, unknown[][]>();
  const predicates: { table: unknown; value: SQL }[] = [];
  const writes: { table: unknown; kind: string; value: unknown }[] = [];
  const locks: { table: unknown; mode: string }[] = [];
  const operations: { table: unknown; kind: string; args: unknown[] }[] = [];
  function chain(kind: string, initialTable?: unknown, fields?: unknown) {
    let table = initialTable;
    const query = {
      $dynamic() {
        return query;
      },
      from(value: unknown) {
        table = value;
        return query;
      },
      innerJoin(joined: unknown, condition: unknown) {
        operations.push({ table, kind: 'innerJoin', args: [joined, condition] });
        return query;
      },
      leftJoin(joined: unknown, condition: unknown) {
        operations.push({ table, kind: 'leftJoin', args: [joined, condition] });
        return query;
      },
      where(value?: SQL) {
        if (value) predicates.push({ table, value });
        return query;
      },
      union(other: unknown) {
        operations.push({ table, kind: 'union', args: [other] });
        return query;
      },
      orderBy(...values: unknown[]) {
        operations.push({ table, kind: 'orderBy', args: values });
        return query;
      },
      groupBy(...values: unknown[]) {
        operations.push({ table, kind: 'groupBy', args: values });
        return query;
      },
      limit(limit: number) {
        operations.push({ table, kind: 'limit', args: [limit] });
        return query;
      },
      for(mode: string, options?: unknown) {
        operations.push({ table, kind: 'lock', args: [mode, options] });
        locks.push({ table, mode });
        return query;
      },
      set(value: unknown) {
        writes.push({ table, kind, value });
        return query;
      },
      values(value: unknown) {
        writes.push({ table, kind, value });
        return query;
      },
      onConflictDoNothing(value?: unknown) {
        operations.push({ table, kind: 'onConflictDoNothing', args: [value] });
        return query;
      },
      returning(value?: unknown) {
        operations.push({ table, kind: 'returning', args: [value] });
        return query;
      },
      then(resolve: (value: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        const values = rows.get(table)?.shift() ?? [];
        const selected =
          fields && typeof fields === 'object'
            ? values.map((value) => {
                if (!value || typeof value !== 'object') return value;
                return Object.fromEntries(
                  Object.keys(fields)
                    .filter((key) => key in value)
                    .map((key) => [key, Reflect.get(value, key)]),
                );
              })
            : values;
        return Promise.resolve(selected).then(resolve, reject);
      },
    };
    return query;
  }
  const database = {
    select: (fields?: unknown) => chain('select', undefined, fields),
    selectDistinct: (fields?: unknown) => chain('select', undefined, fields),
    insert: (table: unknown) => chain('insert', table),
    update: (table: unknown) => chain('update', table),
    delete: (table: unknown) => {
      operations.push({ table, kind: 'delete', args: [] });
      return chain('delete', table);
    },
    transaction: async (work: (transaction: unknown) => Promise<unknown>) => work(database),
  };
  return {
    database: database as unknown as Database,
    transaction: database as unknown as Transaction,
    predicates,
    operations,
    writes,
    locks,
    enqueue(table: unknown, ...values: unknown[][]) {
      rows.set(table, [...(rows.get(table) ?? []), ...values]);
    },
  };
}
