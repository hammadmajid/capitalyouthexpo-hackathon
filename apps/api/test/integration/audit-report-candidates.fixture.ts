import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { residentReceiptSnapshotSchema } from '@hsm/contracts';
import {
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  residentPayments,
  residentReceipts,
  residents,
  stays,
} from '@hsm/db';
import { fullPeriod, lifecycleHarness } from './phase-nine-fixture.js';

// Real immutable financial fixtures, using bounded receipts (100 allocations),
// with no alterations to historical invoices or an invented payment status.
export async function reportCandidateFixture(h: ReturnType<typeof lifecycleHarness>) {
  const { stay, item, base, rent } = await h.admitted(fullPeriod, '2026-08-25');
  const branchId = item.branchId,
    db = h.fixture().connection.db,
    owner = h.fixture().ownerId;
  const [initial] = await h.invoices(stay.stayId);
  if (!initial) throw new Error('Initial invoice missing');
  await h.ok(base + '/payments', {
    amountPaisa: rent + 100,
    method: 'cash',
    paidOn: h.date(),
    note: 'Synthetic external cash receipt',
    allocations: [{ invoiceId: initial.id, amountPaisa: rent }],
    depositPaisa: 100,
    advanceCreditPaisa: 0,
  });
  const [receipt] = await db
    .select()
    .from(residentReceipts)
    .where(eq(residentReceipts.stayId, stay.stayId));
  if (!receipt) throw new Error('Approved receipt missing');
  const scope = { branchId, stayId: stay.stayId };
  let lastNumber = '';
  await db.transaction(async (tx) => {
    for (let first = 0; first <= 5000; first += 100) {
      const rows = Array.from({ length: Math.min(100, 5001 - first) }, (_, offset) => ({
        index: first + offset,
        chargeId: randomUUID(),
        invoiceId: randomUUID(),
        residentId: randomUUID(),
        stayId: randomUUID(),
      }));
      await tx.insert(residentCharges).values(
        rows.map((row) => ({
          id: row.chargeId,
          ...scope,
          agreementId: stay.agreementId,
          kind: 'rent' as const,
          sourceKey: 'audit-report:' + row.index,
          descriptionSnapshot: 'Synthetic agreed rent',
          amountPaisa: 1n,
          quantity: 1,
          periodStart: h.date(),
          periodEnd: '2026-07-01',
          postedByUserId: owner,
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
          dueDate: row.index === 5000 ? '2026-06-26' : h.date(),
          state: 'issued' as const,
          issuedByUserId: owner,
          issuedAt: h.clock(),
        })),
      );
      await tx
        .insert(residentInvoiceCharges)
        .values(
          rows.map((row) => ({ ...scope, invoiceId: row.invoiceId, chargeId: row.chargeId })),
        );
      // These are financial-query candidates, not actual admission/occupancy claims.
      // Equal display names additionally exercise the stable Stay-ID tie breaker.
      await tx.insert(residents).values(
        rows.map((row) => ({
          id: row.residentId,
          branchId,
          displayName: 'AAAA synthetic candidate',
          createdByUserId: owner,
        })),
      );
      await tx.insert(stays).values(
        rows.map((row) => ({
          id: row.stayId,
          branchId,
          residentId: row.residentId,
          source: 'manual' as const,
          state: 'check_in_ready' as const,
          moveInDate: h.date(),
          createdByUserId: owner,
        })),
      );
      const paid = rows.filter((row) => row.index < 5000);
      if (!paid.length) {
        lastNumber = 'INV-' + rows[0]?.invoiceId;
        continue;
      }
      const paymentId = randomUUID();
      await tx.insert(residentPayments).values({
        id: paymentId,
        ...scope,
        sourceKey: 'audit-report:' + first,
        amountPaisa: BigInt(paid.length),
        method: 'cash',
        paidOn: h.date(),
        approvedByUserId: owner,
        approvedAt: h.clock(),
        note: 'Synthetic externally received cash',
      });
      const snapshot = residentReceiptSnapshotSchema.parse({
        ...receipt.snapshot,
        paymentId,
        amountPaisa: paid.length,
        allocations: paid.map((row) => ({
          invoiceId: row.invoiceId,
          invoiceNumber: 'INV-' + row.invoiceId,
          amountPaisa: 1,
        })),
        distribution: { allocatedPaisa: paid.length, depositPaisa: 0, advanceCreditPaisa: 0 },
      });
      await tx
        .insert(residentReceipts)
        .values({ ...scope, paymentId, number: 'RCP-' + paymentId, snapshot, issuedAt: h.clock() });
      await tx.insert(residentLedger).values(
        paid.map((row) => ({
          ...scope,
          paymentId,
          fundingPaymentId: paymentId,
          invoiceId: row.invoiceId,
          account: 'receivable' as const,
          side: 'credit' as const,
          amountPaisa: 1n,
          postedAt: h.clock(),
        })),
      );
    }
  });
  return { branchId, stayId: stay.stayId, lastNumber };
}
