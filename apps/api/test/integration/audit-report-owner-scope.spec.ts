import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { branches } from '@hsm/db';
import { reportSchema } from '@hsm/contracts';
import { lifecycleHarness } from './phase-nine-fixture.js';
const h = lifecycleHarness();
let original: string;
let originalRoom: string;
const target = randomUUID();
beforeAll(async () => {
  await h.start();
  const item = await h.fixture().inventory({ photos: false });
  original = item.branchId;
  originalRoom = item.roomId;
  const db = h.fixture().connection.db;
  const [source] = await db.select().from(branches).where(eq(branches.id, original));
  if (!source) throw new Error('Disposable source branch missing');
  await db.insert(branches).values(
    Array.from({ length: 101 }, (_, index) => {
      const id = index === 100 ? target : randomUUID();
      return {
        ...source,
        id,
        slug: id,
        name: 'Synthetic scope branch ' + String(index).padStart(3, '0'),
        location: 'SRID=4326;POINT(73.0479 33.6844)',
      };
    }),
  );
});
afterAll(() => h.close());
it('RPT-001 / SEC-003 / AUD-010: an owned branch beyond dashboard enumeration remains authorized in owner reports', async () => {
  const direct = await h.get(`/v1/branches/${target}/reports/occupancy`);
  expect(direct.statusCode, direct.body).toBe(200);
  const owner = await h.get('/v1/owner/reports/occupancy?branchIds=' + target);
  expect(owner.statusCode, owner.body).toBe(200);
  expect(reportSchema.parse(owner.json()).rows.map((row) => row[0])).toEqual([
    'Synthetic scope branch 100',
  ]);
});
it('RPT-001 / AUD-005/010: all-owned reports include every authorized branch rather than the first 100', async () => {
  const owner = await h.get('/v1/owner/reports/occupancy');
  expect(owner.statusCode, owner.body).toBe(200);
  const report = reportSchema.parse(owner.json());
  expect(report.rows).toHaveLength(102);
  expect(report.rows.map((row) => row[0])).toContain('Synthetic scope branch 100');
  expect(report.truncated).toBe(false);
});
it('RPT-001 / AUD-010: repeating the same selected branch never duplicates report rows or aggregates', async () => {
  const owner = await h.get(
    `/v1/owner/reports/occupancy?branchIds=${original}&branchIds=${original}`,
  );
  expect(owner.statusCode, owner.body).toBe(200);
  expect(reportSchema.parse(owner.json()).rows).toHaveLength(1);
});
it('RPT-001 / AUD-010: an owner location filter returns the matching branch without unrelated zero aggregate groups', async () => {
  const response = await h.get('/v1/owner/reports/occupancy?roomId=' + originalRoom);
  expect(response.statusCode, response.body).toBe(200);
  const report = reportSchema.parse(response.json());
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0]?.[2]).toBe('2');
});
