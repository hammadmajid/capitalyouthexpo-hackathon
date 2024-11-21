import { expect, it } from 'vitest';
import { drizzle } from 'drizzle-orm/postgres-js';
import { PgDialect } from 'drizzle-orm/pg-core';
import { platformWindowMetrics } from './platform-window-metrics.js';
import type { Transaction } from '../audit/writer.js';
// Build real Drizzle subquery SQL without connecting to a database; inspect exact aggregation.
it('RPT-003: first human response is aggregated server-side from cohort without row cap', async () => {
  const database = drizzle.mock();
  const selections: unknown[] = [];
  const fake = {
    select: (fields: unknown) => {
      const select = database.select(fields as never);
      const from = select.from.bind(select);
      return Object.assign(select, {
        from: (...args: Parameters<typeof from>) => {
          const query = from(...args);
          Object.assign(query, {
            then: (resolve: (rows: unknown[]) => unknown) => {
              selections.push(query.toSQL());
              return Promise.resolve(
                args[0] && selections.length === 1
                  ? [{ state: 'confirmed', count: 100001 }]
                  : [{ count: 100001, average: 12, slow: 4 }],
              ).then(resolve);
            },
          });
          return query;
        },
      });
    },
  };
  const result = await platformWindowMetrics(
    fake as unknown as Transaction,
    new Date('2026-09-30T19:00:00Z'),
    new Date('2026-10-30T19:00:00Z'),
  );
  expect(result).toMatchObject({
    bookingRequests: 100001,
    respondedRequests: 100001,
    averageResponseHours: 12,
    slowResponses: 4,
  });
  const sql = String(Reflect.get(selections[1] as object, 'sql'));
  expect(sql).toContain('min(');
  expect(sql).toContain('first_decisions');
  expect(sql).toContain('avg(');
  expect(sql).toContain('24 hours');
  expect(sql.toLowerCase()).not.toContain(' limit ');
  expect(new PgDialect()).toBeDefined();
});
