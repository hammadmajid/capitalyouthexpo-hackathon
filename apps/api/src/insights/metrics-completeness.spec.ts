import { expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readResidentInvoiceBalance, residentInvoices } from '@hsm/db';
import { queryFixture } from '../../test/unit/query-fixture.js';
import { monthRange, rentMonth } from './metrics.js';
import { rentCollectionReport } from './reports-financial.js';

vi.mock('@hsm/db', async (original) => ({
  ...(await original<typeof import('@hsm/db')>()),
  readResidentInvoiceBalance: vi.fn(),
  readResidentInvoiceBalances: vi.fn(
    async (_tx: unknown, value: { invoices: { invoiceId: string; stayId: string }[] }) =>
      Promise.all(value.invoices.map((row) => readResidentInvoiceBalance(_tx as never, row))),
  ),
}));
const branchId = '10000000-0000-4000-8000-000000000001';
it('FIN-001 / RPT-001 / AUD-010: canonical invoice status narrows counts and every monthly money total together', async () => {
  const f = queryFixture();
  f.enqueue(residentInvoices, [
    { id: 'paid', stayId: 'stay', dueDate: '2026-06-01' },
    { id: 'overdue', stayId: 'stay', dueDate: '2026-06-01' },
  ]);
  vi.mocked(readResidentInvoiceBalance)
    .mockReset()
    .mockResolvedValueOnce({
      state: 'paid',
      totalPaisa: 1000,
      debitAdjustmentsPaisa: 10,
      creditAdjustmentsPaisa: 0,
      allocatedPaisa: 1010,
      outstandingPaisa: 0,
    } as never)
    .mockResolvedValueOnce({
      state: 'overdue',
      totalPaisa: 9000,
      debitAdjustmentsPaisa: 0,
      creditAdjustmentsPaisa: 0,
      allocatedPaisa: 1000,
      outstandingPaisa: 8000,
    } as never);
  expect(
    await rentMonth(f.transaction, branchId, '2026-06', '2026-06-28', undefined, 'paid'),
  ).toEqual({
    month: '2026-06',
    invoices: 1,
    expectedPaisa: 1010,
    collectedPaisa: 1010,
    outstandingPaisa: 0,
    overdueInvoices: 0,
  });
});

it('FIN-001 / AUD-005: unsafe monthly money aggregates fail rather than round', async () => {
  const f = queryFixture();
  f.enqueue(residentInvoices, [
    { id: 'first', stayId: 'stay', dueDate: '2026-06-01' },
    { id: 'second', stayId: 'stay', dueDate: '2026-06-01' },
  ]);
  vi.mocked(readResidentInvoiceBalance).mockResolvedValue({
    state: 'issued',
    totalPaisa: Number.MAX_SAFE_INTEGER,
    debitAdjustmentsPaisa: 0,
    creditAdjustmentsPaisa: 0,
    allocatedPaisa: 0,
    outstandingPaisa: Number.MAX_SAFE_INTEGER,
  } as never);
  await expect(rentMonth(f.transaction, branchId, '2026-06', '2026-06-01')).rejects.toThrow();
});
it('RPT-001 / AUD-005: requests beyond 24 rent months receive an explicit range error', async () => {
  const f = queryFixture();
  await expect(
    rentCollectionReport(f.transaction, [branchId], {
      from: '2024-01-01',
      to: '2026-01-01',
      today: '2026-01-01',
      now: new Date(),
    }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', status: 400 });
});
it('RPT-001 / AUD-005: the supported 24-month range retains all requested rows', async () => {
  const f = queryFixture();
  const report = await rentCollectionReport(f.transaction, [branchId], {
    from: '2024-01-01',
    to: '2025-12-31',
    today: '2026-01-01',
    now: new Date(),
  });
  expect(report.rows).toHaveLength(24);
  expect(report.rows[0]?.[1]).toBe('2024-01');
  expect(report.rows.at(-1)?.[1]).toBe('2025-12');
});
it('FIN-001 / AUD-005: the maximum accepted December has a valid month end', () => {
  expect(monthRange('9999-12')).toEqual({ start: '9999-12-01', end: '9999-12-31' });
});
it.each([0, 1, 100, 101, 200, 201])(
  'FIN-001 / AUD-005: bounded traversal includes all %i candidates and advances an exact scoped cursor',
  async (count) => {
    const f = queryFixture();
    const rows = Array.from({ length: count }, (_, index) => ({
      id: String(index).padStart(5, '0'),
      stayId: 'scoped-stay',
      dueDate: '2026-06-01',
    }));
    for (let offset = 0; offset < count; offset += 100)
      f.enqueue(residentInvoices, rows.slice(offset, offset + 100));
    vi.mocked(readResidentInvoiceBalance).mockResolvedValue({
      state: 'issued',
      totalPaisa: 1,
      debitAdjustmentsPaisa: 0,
      creditAdjustmentsPaisa: 0,
      allocatedPaisa: 0,
      outstandingPaisa: 1,
    } as never);
    expect(await rentMonth(f.transaction, branchId, '2026-06', '2026-06-01')).toMatchObject({
      invoices: count,
      expectedPaisa: count,
      outstandingPaisa: count,
    });
    expect(
      f.operations
        .filter((operation) => operation.kind === 'limit')
        .every((operation) => operation.args[0] === 100),
    ).toBe(true);
    const predicates = f.predicates.map((entry) => new PgDialect().sqlToQuery(entry.value));
    expect(predicates.every((query) => query.params[0] === branchId)).toBe(true);
    if (count >= 100) {
      expect(predicates[1]?.params).toContain('00099');
      expect(predicates[1]?.sql).toContain(' > ');
    }
  },
);
