import type { SQL } from 'drizzle-orm';
import type { Database } from '../src/index.js';
// Unit-only transaction port. Real row locks, rollback and constraints remain Testcontainers cases.
export function visitFixture() {
  const data = new Map<unknown, unknown[][]>();
  const writes: { table: unknown; kind: string; value: unknown }[] = [];
  const predicates: { table: unknown; value: SQL }[] = [];
  let failTable: unknown;
  function query(kind: string, table?: unknown) {
    const builder = {
      from(value: unknown) {
        table = value;
        return builder;
      },
      where(value: SQL) {
        predicates.push({ table, value });
        return builder;
      },
      orderBy() {
        return builder;
      },
      limit() {
        return builder;
      },
      for() {
        return builder;
      },
      values(value: unknown) {
        writes.push({ table, kind, value });
        return builder;
      },
      set(value: unknown) {
        writes.push({ table, kind, value });
        return builder;
      },
      onConflictDoNothing() {
        return builder;
      },
      then(resolve: (rows: unknown[]) => unknown, reject: (error: unknown) => unknown) {
        return (
          table === failTable
            ? Promise.reject(new Error('Required write failed'))
            : Promise.resolve(kind === 'select' ? (data.get(table)?.shift() ?? []) : [])
        ).then(resolve, reject);
      },
    };
    return builder;
  }
  const port = {
    select: () => query('select'),
    insert: (table: unknown) => query('insert', table),
    update: (table: unknown) => query('update', table),
    transaction: async (work: (tx: unknown) => Promise<unknown>) => work(port),
  };
  return {
    db: port as unknown as Database,
    writes,
    predicates,
    enqueue(table: unknown, ...rows: unknown[][]) {
      data.set(table, [...(data.get(table) ?? []), ...rows]);
    },
    fail(table: unknown) {
      failTable = table;
    },
  };
}
