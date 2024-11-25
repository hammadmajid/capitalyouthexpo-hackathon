import { afterAll, beforeAll, expect, it } from 'vitest';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import pino from 'pino';
import { residentInvoices, users, type Database } from '@hsm/db';
import * as schema from '@hsm/db/schema';
import { z } from 'zod';
import { ReportService } from '../../src/insights/reports.service.js';
import { reportPerformanceFixture } from './report-performance.fixture.js';
let f: Awaited<ReturnType<typeof reportPerformanceFixture>>;
let db: Database, service: ReportService;
let queryCount = 0;
let observe: (() => void) | undefined;
const log = pino({ name: 'AUD-012-performance', level: 'info' });
beforeAll(async () => {
  f = await reportPerformanceFixture();
  db = drizzle(f.connection.db.$client, {
    schema,
    logger: {
      logQuery(query: string) {
        queryCount++;
        if (query.includes('resident_invoices')) observe?.();
      },
    },
  });
  service = new ReportService(db, () => f.now);
});
afterAll(async () => {
  await f?.close();
});
const actor = async () =>
  f.service.authenticate(f.ownerHeaders.authorization.slice('Bearer '.length));
it.each(['json', 'csv', 'pdf'] as const)(
  'AUD-012 / RPT-001: representative1001-invoice %s preserves full output and records bounded query/memory cost',
  async (format) => {
    const a = await actor();
    queryCount = 0;
    const start = performance.now(),
      memory = process.memoryUsage().heapUsed;
    const result = await service.branch(a, f.branchA, 'outstanding-dues', { format });
    const elapsedMs = Math.round(performance.now() - start),
      heapDeltaBytes = process.memoryUsage().heapUsed - memory;
    expect(result.report.rows).toHaveLength(f.expectedInvoices);
    expect(result.report.truncated).toBe(false);
    expect(queryCount).toBeLessThan(150);
    if (format === 'pdf')
      expect(Buffer.from(result.body).subarray(0, 8).toString('latin1')).toBe('%PDF-1.4');
    log.info(
      {
        scenario: 'outstanding',
        format,
        rows: result.report.rows.length,
        queryCount,
        elapsedMs,
        heapDeltaBytes,
        proxyBudgetMs: 10000,
      },
      'Bounded representative report observation',
    );
  },
);
it('AUD-012 / RPT-001: representative1001-Stay deposits use canonical batch reads', async () => {
  queryCount = 0;
  const start = performance.now();
  const result = await service.branch(await actor(), f.branchA, 'security-deposits', {});
  expect(result.report.rows).toHaveLength(0);
  expect(result.report.truncated).toBe(false);
  expect(queryCount).toBeLessThan(150);
  log.info(
    {
      scenario: 'deposits',
      candidates: f.expectedStays,
      rows: 0,
      queryCount,
      elapsedMs: Math.round(performance.now() - start),
    },
    'Bounded representative report observation',
  );
});
it('AUD-012: record actual candidate plan/index use without logging identities or parameters', async () => {
  const query = db
    .select({ id: residentInvoices.id })
    .from(residentInvoices)
    .where(
      and(eq(residentInvoices.branchId, f.branchA), lte(residentInvoices.dueDate, '2026-10-28')),
    )
    .orderBy(asc(residentInvoices.dueDate), asc(residentInvoices.id))
    .limit(100);
  const result = await db.execute(sql`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`);
  const node = z
    .object({
      'Node Type': z.string(),
      'Relation Name': z.string().optional(),
      'Index Name': z.string().optional(),
      'Actual Rows': z.number().optional(),
      Plans: z.array(z.unknown()).optional(),
    })
    .passthrough();
  const root = z
    .array(z.object({ Plan: z.unknown(), 'Execution Time': z.number() }))
    .parse(result[0]?.['QUERY PLAN']);
  const summary: { node: string; relation?: string; index?: string; rows?: number }[] = [];
  function visit(value: unknown) {
    const parsed = node.parse(value);
    summary.push({
      node: parsed['Node Type'],
      ...(parsed['Relation Name'] ? { relation: parsed['Relation Name'] } : {}),
      ...(parsed['Index Name'] ? { index: parsed['Index Name'] } : {}),
      ...(parsed['Actual Rows'] === undefined ? {} : { rows: parsed['Actual Rows'] }),
    });
    for (const child of parsed.Plans ?? []) visit(child);
  }
  visit(root[0]?.Plan);
  expect(summary.length).toBeGreaterThan(0);
  log.info(
    { scenario: 'candidate-plan', executionMs: root[0]?.['Execution Time'], nodes: summary },
    'Sanitized actual query plan',
  );
});
it('AUD-012 / ACC-004: measure same-actor writer delay while the report holds its existing authority locks', async () => {
  const a = await actor();
  let entered!: () => void;
  const started = new Promise<void>((resolve) => {
    entered = resolve;
  });
  observe = () => {
    observe = undefined;
    entered();
  };
  const report = service.branch(a, f.branchA, 'outstanding-dues', {});
  await Promise.race([
    started,
    report.then(() => {
      throw new Error('Report completed before measurement barrier');
    }),
  ]);
  const at = performance.now();
  await Promise.all([
    report,
    db.transaction(async (tx) => {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, f.ownerId)).for('update');
    }),
  ]);
  log.info(
    { scenario: 'same-actor-writer', delayMs: Math.round(performance.now() - at) },
    'Observed authority lock delay',
  );
});
