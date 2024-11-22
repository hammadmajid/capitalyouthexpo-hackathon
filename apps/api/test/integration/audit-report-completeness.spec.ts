import { afterAll, beforeAll, expect, it } from 'vitest';
import pino from 'pino';
import { reportSchema, toCsv } from '@hsm/contracts';
import { lifecycleHarness } from './phase-nine-fixture.js';
import { reportCandidateFixture } from './audit-report-candidates.fixture.js';

const h = lifecycleHarness();
const setupLog = pino({ name: 'audit-006-setup', level: 'info' });
let scope: Awaited<ReturnType<typeof reportCandidateFixture>>;
beforeAll(async () => {
  const started = performance.now();
  setupLog.info({ stage: 'containers-and-application' }, 'RPT-001 setup stage');
  await h.start();
  setupLog.info(
    { stage: 'financial-candidates', elapsedMs: Math.round(performance.now() - started) },
    'RPT-001 setup stage',
  );
  scope = await reportCandidateFixture(h);
  setupLog.info(
    { stage: 'ready', elapsedMs: Math.round(performance.now() - started) },
    'RPT-001 setup stage',
  );
});
afterAll(() => h.close());
it('RPT-001 / AUD-006: actual outstanding report finds later debt after 5001 receipt-paid invoices', async () => {
  const response = await h.get(
    `/v1/branches/${scope.branchId}/reports/outstanding-dues?to=2026-06-26`,
  );
  expect(response.statusCode, response.body).toBe(200);
  const report = reportSchema.parse(response.json());
  expect(report.truncated).toBe(false);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0]).toContain(scope.lastNumber);
  expect(report.rows[0]?.at(-1)).toBe('0.01');
});
it('RPT-001 / AUD-006: actual deposit report finds receipt-backed funds after 5001 empty Stays', async () => {
  const response = await h.get(`/v1/branches/${scope.branchId}/reports/security-deposits`);
  expect(response.statusCode, response.body).toBe(200);
  const report = reportSchema.parse(response.json());
  expect(report.truncated).toBe(false);
  expect(report.rows).toHaveLength(1);
  expect(report.rows[0]?.slice(3)).toEqual(['1.00', '0.00', '0.00', '0.00', '1.00']);
});
it('SEC-003 / RPT-001 / AUD-006: complete scans retain branch authority and historical as-of bounds', async () => {
  const previous = await h.get(
    `/v1/branches/${scope.branchId}/reports/outstanding-dues?to=2026-06-25`,
  );
  expect(previous.statusCode, previous.body).toBe(200);
  expect(reportSchema.parse(previous.json()).rows).toHaveLength(0);
  const other = await h.fixture().inventory();
  for (const type of ['outstanding-dues', 'security-deposits']) {
    const empty = await h.get(`/v1/branches/${other.branchId}/reports/${type}`);
    expect(empty.statusCode, empty.body).toBe(200);
    expect(reportSchema.parse(empty.json())).toMatchObject({ rows: [], truncated: false });
    const denied = await h.get(
      `/v1/branches/${scope.branchId}/reports/${type}`,
      h.fixture().customerBToken,
    );
    expect(denied.statusCode).toBe(403);
  }
});
it.each([
  ['outstanding-dues', 'csv'],
  ['outstanding-dues', 'pdf'],
  ['security-deposits', 'csv'],
  ['security-deposits', 'pdf'],
])('RPT-001/002 / AUD-006: %s %s uses the complete eligible-row result', async (type, format) => {
  const url = `/v1/branches/${scope.branchId}/reports/${type}?to=2026-06-26`;
  const json = await h.get(url);
  expect(json.statusCode, json.body).toBe(200);
  const report = reportSchema.parse(json.json());
  expect(report.rows).toHaveLength(1);
  const file = await h.get(url + '&format=' + format);
  expect(file.statusCode).toBe(200);
  if (format === 'csv') expect(file.body).toBe(toCsv(report));
  else {
    expect(file.headers['content-type']).toContain('application/pdf');
    expect(file.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  }
});
