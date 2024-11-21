import { beforeEach, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { residentInvoices, readResidentInvoiceBalances, stays } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { lockStaffScope } from '../services/scope.js';
import { dashboardQueue } from './dashboard-queues.service.js';
import { overdueQueue } from './dashboard-overdue.repository.js';
vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalances: vi.fn(),
}));
vi.mock('../services/scope.js', () => ({ lockStaffScope: vi.fn() }));
const branchId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  stayId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const clock = () => new Date('2026-10-28T00:00:00Z');
const actor = { userId: stayId, sessionId: branchId };
beforeEach(() => vi.resetAllMocks());
it.each([
  ['overdue', 'finance_view'],
  ['complaints', 'stay_manage'],
  ['checkouts', 'stay_manage'],
] as const)(
  'AUD-009 / ACC-002: %s proves its live exact-branch grant even for an empty queue',
  async (queue, grant) => {
    const f = queryFixture();
    vi.mocked(readResidentInvoiceBalances).mockResolvedValue([]);
    await expect(
      dashboardQueue(f.database, actor, branchId, queue, { limit: 1 }, clock),
    ).resolves.toMatchObject({ branchId, queue, data: [], nextCursor: null, asOf: '2026-10-28' });
    expect(lockStaffScope).toHaveBeenCalledWith(f.transaction, actor, branchId, [grant], clock);
    if (queue === 'overdue') expect(readResidentInvoiceBalances).not.toHaveBeenCalled();
    vi.mocked(lockStaffScope).mockRejectedValue(new Error('Revoked scope'));
    await expect(dashboardQueue(f.database, actor, branchId, queue, {}, clock)).rejects.toThrow(
      'Revoked scope',
    );
  },
);
it('AUD-009 / OWN-003: checkout queue includes notice states independently of expected-date window', async () => {
  const f = queryFixture();
  await dashboardQueue(f.database, actor, branchId, 'checkouts', { limit: 1 }, clock);
  const predicate = f.predicates.find((row) => row.table === stays);
  if (!predicate) throw new Error('Missing checkout predicate');
  const sql = new PgDialect().sqlToQuery(predicate.value);
  expect(sql.params).toEqual([
    branchId,
    'notice_given',
    'checkout_pending',
    'active',
    '2026-10-28',
    '2026-11-11',
  ]);
});
it('AUD-009 / FIN-001: overdue canonical eligibility precedes sentinel and scans beyond a nonmatching candidate batch', async () => {
  const f = queryFixture();
  const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
  const candidates = Array.from({ length: 102 }, (_, index) => ({
    id: id(index + 1),
    stayId,
    displayName: 'Resident',
  }));
  f.enqueue(residentInvoices, candidates.slice(0, 100), candidates.slice(100));
  vi.mocked(readResidentInvoiceBalances).mockImplementation(async (_tx, value) =>
    z
      .object({
        branchId: z.string().uuid(),
        today: z.string(),
        invoices: z
          .array(z.object({ invoiceId: z.string().uuid(), stayId: z.string().uuid() }))
          .min(1)
          .max(100),
      })
      .strict()
      .parse(value)
      .invoices.map((invoice) => ({
        invoiceId: invoice.invoiceId,
        invoiceNumber: 'INV',
        currency: 'PKR',
        dueDate: '2026-10-01',
        graceDays: 0,
        totalPaisa: 100,
        debitAdjustmentsPaisa: 0,
        creditAdjustmentsPaisa: 0,
        allocatedPaisa: invoice.invoiceId <= id(100) ? 100 : 0,
        outstandingPaisa: invoice.invoiceId <= id(100) ? 0 : 100,
        state: invoice.invoiceId <= id(100) ? 'paid' : 'overdue',
      })),
  );
  const page = await overdueQueue(f.transaction, branchId, '2026-10-28', { limit: 1 });
  expect(page.data.map((row) => row.balance.invoiceId)).toEqual([id(101)]);
  expect(page.nextCursor).toBe(id(101));
  expect(readResidentInvoiceBalances).toHaveBeenCalledTimes(2);
  const predicate = f.predicates.find((row) => row.table === residentInvoices);
  if (!predicate) throw new Error('Missing invoice scope');
  expect(new PgDialect().sqlToQuery(predicate.value).params).toEqual([branchId, '2026-10-28']);
});
it.each([
  { queue: 'all', query: {} },
  { queue: 'overdue', query: { limit: 101 } },
  { queue: 'checkouts', query: { cursor: 'foreign' } },
])(
  'AUD-009: malformed queue arguments cannot start a transaction: %j',
  async ({ queue, query }) => {
    const f = queryFixture();
    await expect(
      dashboardQueue(f.database, actor, branchId, queue, query, clock),
    ).rejects.toThrow();
    expect(lockStaffScope).not.toHaveBeenCalled();
  },
);
