import { expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { adminExplorerQuerySchema } from '@hsm/contracts';
import { explorerPaging, explorerPeriods, explorerScope } from './explorer-query.js';
it('HMA-017: statistics use inclusive Karachi month/quarter/year boundaries', () => {
  const dates = explorerPeriods(new Date('2026-03-31T19:01:00Z'));
  expect(dates.month?.toISOString()).toBe('2026-03-31T19:00:00.000Z');
  expect(dates.quarter?.toISOString()).toBe('2026-03-31T19:00:00.000Z');
  expect(dates.year?.toISOString()).toBe('2025-12-31T19:00:00.000Z');
  expect(dates.lifetime).toBeUndefined();
});
it('HMA-017 SEC-003: keyset cursors bind kind, sorting and every scope filter', () => {
  const query = adminExplorerQuerySchema.parse({ q: 'Person', sort: 'name_asc' });
  const fields = { id: sql`id`, name: sql`name`, createdAt: sql`created_at` };
  const scope = explorerScope('users', query);
  const paging = explorerPaging(query, scope, fields);
  const cursor = paging.cursor({
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Person',
    createdAt: '2026-10-31T00:00:00Z',
    status: 'active',
    parentId: null,
    parentName: null,
    quantity: null,
    amountPaisa: null,
    reason: null,
  });
  expect(explorerPaging({ ...query, cursor }, scope, fields).after).toBeDefined();
  expect(() =>
    explorerPaging({ ...query, cursor }, explorerScope('owners', query), fields),
  ).toThrow();
  expect(() =>
    explorerPaging(
      { ...query, cursor },
      explorerScope('users', { ...query, period: 'month' }),
      fields,
    ),
  ).toThrow();
  expect(() => explorerPaging({ ...query, cursor: 'invalid' }, scope, fields)).toThrow();
});
