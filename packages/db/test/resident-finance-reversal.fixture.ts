import { and, eq } from 'drizzle-orm';
import { v7 } from 'uuid';
import { residentLedger, residentPaymentReversals, type Database } from '../src/index.js';
import { financeTime, type FinanceScope } from './resident-finance.fixture.js';
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
// Actual PG constraint fixture, not an authorization or public reversal implementation.
export async function reverseRecordedPayment(
  transaction: Transaction,
  scope: FinanceScope,
  payment: string,
) {
  const id = v7();
  await transaction.insert(residentPaymentReversals).values({
    id,
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId: payment,
    reason: 'Owner correction of wrong recorded payment',
    approvedByUserId: scope.ownerId,
    approvedAt: financeTime,
  });
  const original = await transaction
    .select()
    .from(residentLedger)
    .where(
      and(
        eq(residentLedger.branchId, scope.branchId),
        eq(residentLedger.stayId, scope.stayId),
        eq(residentLedger.paymentId, payment),
      ),
    );
  await transaction.insert(residentLedger).values(
    original.map((row) => ({
      id: v7(),
      branchId: scope.branchId,
      stayId: scope.stayId,
      account: row.account,
      side: row.side === 'credit' ? ('debit' as const) : ('credit' as const),
      amountPaisa: row.amountPaisa,
      invoiceId: row.invoiceId,
      paymentReversalId: id,
      fundingPaymentId: payment,
      reversedEntryId: row.id,
      postedAt: financeTime,
    })),
  );
}
