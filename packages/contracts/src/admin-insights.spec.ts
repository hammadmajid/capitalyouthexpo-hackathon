import { expect, it } from 'vitest';
import {
  platformAnalyticsQuerySchema,
  platformAuditItemSchema,
  platformAuditPosition,
  platformAuditQuerySchema,
} from './admin-insights.js';
const id = '10000000-0000-4000-8000-000000000001',
  at = '2026-10-30T06:00:00.000Z';
it('AUD-001: timestamp plus signed-bigint cursor is closed and bounded', () => {
  expect(platformAuditPosition(at + '|9223372036854775807')).toEqual({
    at,
    id: '9223372036854775807',
  });
  for (const cursor of ['0', at + '|0', at + '|9223372036854775808', at + '|1|', 'bad|1'])
    expect(platformAuditQuerySchema.safeParse({ cursor }).success).toBe(false);
  expect(platformAuditQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
});
it('RPT-003: dates are real calendar values with ordered windows and no caller-defined sources', () => {
  expect(
    platformAnalyticsQuerySchema.safeParse({ from: '2026-02-30', to: '2026-03-01' }).success,
  ).toBe(false);
  expect(
    platformAnalyticsQuerySchema.safeParse({ from: '2026-10-30', to: '2026-10-01' }).success,
  ).toBe(false);
  expect(
    platformAnalyticsQuerySchema.safeParse({ from: '2026-10-01', to: '2026-10-30', table: 'users' })
      .success,
  ).toBe(false);
});
it('SEC-003 AUD-001: audit DTO rejects raw JSON and contact identifiers', () => {
  const row = {
    id: '1',
    actorId: id,
    actorRole: 'root',
    action: 'review.hide',
    targetType: 'review',
    targetId: id,
    createdAt: at,
  };
  expect(platformAuditItemSchema.parse(row)).toEqual(row);
  for (const extra of [
    { before: {} },
    { after: {} },
    { email: 'private@example.test' },
    { ip: '192.0.2.1' },
  ])
    expect(platformAuditItemSchema.safeParse({ ...row, ...extra }).success).toBe(false);
});
