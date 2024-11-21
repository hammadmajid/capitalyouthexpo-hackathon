import { expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { buildings, floors, residents, rooms } from '@hsm/db';
import { reportOptionQuerySchema, reportTypeSchema } from '@hsm/contracts';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { reportOptionsPage } from './report-options.repository.js';
import { reportResidentOptionPredicate } from './report-option-residents.js';
const branch = '10000000-0000-4000-8000-000000000001';
const first = '20000000-0000-4000-8000-000000000001';
const second = '20000000-0000-4000-8000-000000000002';
const row = { id: first, branchId: branch, name: 'Actual name', detail: null, archivedAt: null };
it.each(['building', 'floor', 'room', 'resident'] as const)(
  'RPT-001 / SEC-003 / AUD-010: %s choices retain bounded exact scope, names and archival flags',
  async (field) => {
    const f = queryFixture();
    const table = { building: buildings, floor: floors, room: rooms, resident: residents }[field];
    if (field === 'floor') f.enqueue(buildings, [{ id: first, branchId: branch }]);
    f.enqueue(table, [{ ...row, archivedAt: field === 'resident' ? new Date() : null }]);
    const input = reportOptionQuerySchema.parse({
      field,
      ...(field === 'floor' ? { buildingId: first } : {}),
    });
    const page = await reportOptionsPage(f.transaction, branch, 'residents', input);
    expect(page).toMatchObject({
      branchId: branch,
      type: 'residents',
      field,
      buildingId: field === 'floor' ? first : null,
      floorId: null,
      data: [{ id: first, name: row.name, detail: null, archived: field === 'resident' }],
      nextCursor: null,
    });
    expect(f.operations.filter((value) => value.kind === 'limit').at(-1)?.args).toEqual([21]);
  },
);
it('SEC-003 / RPT-001 / AUD-010: named pagination rejects duplicate/foreign/oversized data rather than widening scope', async () => {
  for (const rows of [
    [row, row],
    [{ ...row, branchId: second }],
    [row, { ...row, id: second }, { ...row, id: branch }],
  ]) {
    const f = queryFixture();
    f.enqueue(buildings, rows);
    await expect(
      reportOptionsPage(
        f.transaction,
        branch,
        'occupancy',
        reportOptionQuerySchema.parse({ field: 'building', limit: 1 }),
      ),
    ).rejects.toMatchObject({ code: 'INTERNAL' });
  }
});
it('RPT-001 / AUD-010: literal search and cursor remain parameters; matching rows provide an exact sentinel', async () => {
  const f = queryFixture();
  f.enqueue(rooms, [row, { ...row, id: second }]);
  const q = reportOptionQuerySchema.parse({ field: 'room', limit: 1, search: '%_\\' });
  const page = await reportOptionsPage(f.transaction, branch, 'occupancy', q);
  expect(page.nextCursor).toBe(first);
  const predicate = f.predicates.find((value) => value.table === rooms);
  expect(predicate).toBeDefined();
  const compiled = new PgDialect().sqlToQuery(sql`${predicate?.value}`);
  expect(compiled.params).toContain(branch);
  expect(compiled.params).toContain('%\\%\\_\\\\%');
  const next = queryFixture();
  next.enqueue(rooms, [{ ...row, id: second }]);
  const last = await reportOptionsPage(next.transaction, branch, 'occupancy', {
    ...q,
    cursor: first,
  });
  expect(last.nextCursor).toBeNull();
  expect(new PgDialect().sqlToQuery(sql`${next.predicates[0]?.value}`).params).toContain(first);
});
it.each(reportTypeSchema.options)(
  'SEC-003 / AUD-010: resident names require a permitted %s fact without directory fields',
  (kind) => {
    if (kind === 'occupancy' || kind === 'bookings') {
      expect(() => reportResidentOptionPredicate(kind)).toThrowError(
        expect.objectContaining({ code: 'VALIDATION_FAILED' }),
      );
      return;
    }
    const query = new PgDialect().sqlToQuery(reportResidentOptionPredicate(kind));
    expect(query.sql).toContain('"stays"."branch_id" = "residents"."branch_id"');
    expect(query.sql).toContain('"stays"."resident_id" = "residents"."id"');
    expect(query.sql).not.toMatch(/phone|email|user_id|checked_in_at|room_label/);
    if (kind === 'payment-history' || kind === 'security-deposits')
      expect(query.sql).toContain('resident_receipts');
  },
);
