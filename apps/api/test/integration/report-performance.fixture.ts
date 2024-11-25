import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import {
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  residents,
  stays,
} from '@hsm/db';
import { dashboardQueuesFixture } from './dashboard-queues.fixture.js';
import { invoiceFixture } from './stay-invoice.fixture.js';
// Bounded representative data, not production scale. Real immutable financial
// records preserve the original charge/agreement/ledger sources and database guards.
export async function reportPerformanceFixture() {
  const f = await dashboardQueuesFixture();
  try {
    const item = await invoiceFixture(f);
    const [initial] = await f.connection.db
      .select()
      .from(residentInvoices)
      .where(eq(residentInvoices.id, item.invoiceId));
    if (!initial) throw new Error('Missing performance invoice');
    const [link] = await f.connection.db
      .select()
      .from(residentInvoiceCharges)
      .where(eq(residentInvoiceCharges.invoiceId, item.invoiceId));
    if (!link) throw new Error('Missing performance charge link');
    const [original] = await f.connection.db
      .select()
      .from(residentCharges)
      .where(eq(residentCharges.id, link.chargeId));
    if (!original) throw new Error('Missing performance charge');
    await f.connection.db.transaction(async (tx) => {
      for (let offset = 0; offset < 1000; offset += 100) {
        const rows = Array.from({ length: 100 }, (_, index) => ({
          invoiceId: randomUUID(),
          chargeId: randomUUID(),
          residentId: randomUUID(),
          stayId: randomUUID(),
          number: offset + index,
        }));
        await tx.insert(residentCharges).values(
          rows.map((row) => ({
            id: row.chargeId,
            branchId: item.branchId,
            stayId: item.stayId,
            agreementId: original.agreementId,
            kind: 'rent' as const,
            sourceKey: 'report-perf:' + row.chargeId,
            descriptionSnapshot: 'Representative report charge',
            amountPaisa: 1n,
            quantity: 1,
            periodStart: original.periodStart,
            periodEnd: original.periodEnd,
            postedByUserId: f.ownerId,
            postedAt: f.now,
          })),
        );
        await tx.insert(residentLedger).values(
          rows.map((row) => ({
            branchId: item.branchId,
            stayId: item.stayId,
            chargeId: row.chargeId,
            account: 'receivable' as const,
            side: 'debit' as const,
            amountPaisa: 1n,
            postedAt: f.now,
          })),
        );
        await tx.insert(residentInvoices).values(
          rows.map((row) => ({
            id: row.invoiceId,
            branchId: item.branchId,
            stayId: item.stayId,
            number: 'PERF-' + row.invoiceId,
            totalPaisa: 1n,
            dueDate: initial.dueDate,
            state: 'issued' as const,
            issuedByUserId: f.ownerId,
            issuedAt: f.now,
          })),
        );
        await tx.insert(residentInvoiceCharges).values(
          rows.map((row) => ({
            branchId: item.branchId,
            stayId: item.stayId,
            invoiceId: row.invoiceId,
            chargeId: row.chargeId,
          })),
        );
        await tx.insert(residents).values(
          rows.map((row) => ({
            id: row.residentId,
            branchId: item.branchId,
            displayName: 'Representative resident ' + String(row.number).padStart(4, '0'),
            createdByUserId: f.ownerId,
          })),
        );
        await tx.insert(stays).values(
          rows.map((row) => ({
            id: row.stayId,
            branchId: item.branchId,
            residentId: row.residentId,
            source: 'manual' as const,
            state: 'check_in_ready' as const,
            moveInDate: '2026-10-01',
            createdByUserId: f.ownerId,
          })),
        );
      }
    });
    return { ...f, item, expectedInvoices: 1001, expectedStays: 1001 };
  } catch (error) {
    await f.close();
    throw error;
  }
}
