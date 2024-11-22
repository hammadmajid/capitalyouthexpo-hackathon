import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { residentCharges, residentInvoiceCharges, residentInvoices, residentLedger } from '@hsm/db';
import { actionCounts, rentMonth } from '../../src/insights/metrics.js';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';

const h = lifecycleHarness();
let branchId: string, expected: number, collected: number;
beforeAll(async () => {
  await h.start();
  const { stay, item, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  branchId = item.branchId;
  collected = Math.floor(rent / 2);
  expected = rent + 2000;
  const [invoice] = await h.invoices(stay.stayId);
  await h.ok(base + '/payments', {
    amountPaisa: collected,
    method: 'cash',
    paidOn: h.date(),
    note: 'Synthetic externally received partial payment',
    allocations: [{ invoiceId: invoice?.id, amountPaisa: collected }],
    depositPaisa: 0,
    advanceCreditPaisa: 0,
  });
  // Valid immutable financial fixtures; no source row is rewritten. Chunk only
  // inserts, never the asserted complete result or canonical balance calculation.
  await h.fixture().connection.db.transaction(async (tx) => {
    for (let first = 0; first < 2000; first += 100) {
      const rows = Array.from({ length: 100 }, (_, offset) => ({
        index: first + offset,
        chargeId: randomUUID(),
        invoiceId: randomUUID(),
      }));
      const scope = { branchId, stayId: stay.stayId };
      await tx.insert(residentCharges).values(
        rows.map((row) => ({
          id: row.chargeId,
          ...scope,
          agreementId: stay.agreementId,
          kind: 'rent' as const,
          sourceKey: 'audit-metric:' + row.index,
          descriptionSnapshot: 'Synthetic agreed rent',
          amountPaisa: 1n,
          quantity: 1,
          periodStart: h.date(),
          periodEnd: '2026-07-01',
          postedByUserId: h.fixture().ownerId,
          postedAt: h.clock(),
        })),
      );
      await tx.insert(residentLedger).values(
        rows.map((row) => ({
          ...scope,
          chargeId: row.chargeId,
          account: 'receivable' as const,
          side: 'debit' as const,
          amountPaisa: 1n,
          postedAt: h.clock(),
        })),
      );
      await tx.insert(residentInvoices).values(
        rows.map((row) => ({
          id: row.invoiceId,
          ...scope,
          number: 'INV-' + row.invoiceId,
          totalPaisa: 1n,
          dueDate: h.date(),
          state: 'issued' as const,
          issuedByUserId: h.fixture().ownerId,
          issuedAt: h.clock(),
        })),
      );
      await tx.insert(residentInvoiceCharges).values(
        rows.map((row) => ({
          ...scope,
          invoiceId: row.invoiceId,
          chargeId: row.chargeId,
        })),
      );
    }
  });
});
afterAll(() => h.close());

it('FIN-001 / AUD-005: all 2001 monthly invoices reconcile with a real approved partial receipt', async () => {
  const result = await h
    .fixture()
    .connection.db.transaction((tx) => rentMonth(tx, branchId, '2026-06', '2026-07-10'));
  expect(result).toEqual({
    month: '2026-06',
    invoices: 2001,
    expectedPaisa: expected,
    collectedPaisa: collected,
    outstandingPaisa: expected - collected,
    overdueInvoices: 2001,
  });
});
it('OWN-003 / AUD-005: overdue counts include all 2001 candidates beyond 500', async () => {
  const result = await h
    .fixture()
    .connection.db.transaction((tx) => actionCounts(tx, branchId, '2026-07-10'));
  expect(result.overdueInvoices).toBe(2001);
});
it('OWN-003 / AUD-005: unpaid authoritative debt remains overdue after 400 days', async () => {
  const result = await h
    .fixture()
    .connection.db.transaction((tx) => actionCounts(tx, branchId, '2028-02-10'));
  expect(result.overdueInvoices).toBe(2001);
});
