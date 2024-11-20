import { and, desc, eq, isNull } from 'drizzle-orm';
import { residentPayments, residentPaymentReversals, residentReceipts } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
// PAY-008: only committed, receipted, non-reversed hostel payments are presented.
export async function stayLastPayment(
  tx: PostingTransaction,
  scope: { branchId: string; stayId: string },
) {
  const [payment] = await tx
    .select({
      paymentId: residentPayments.id,
      receiptId: residentReceipts.id,
      receiptNumber: residentReceipts.number,
      amountPaisa: residentPayments.amountPaisa,
      receivedOn: residentPayments.paidOn,
    })
    .from(residentPayments)
    .innerJoin(
      residentReceipts,
      and(
        eq(residentReceipts.paymentId, residentPayments.id),
        eq(residentReceipts.branchId, scope.branchId),
        eq(residentReceipts.stayId, scope.stayId),
      ),
    )
    .leftJoin(
      residentPaymentReversals,
      and(
        eq(residentPaymentReversals.paymentId, residentPayments.id),
        eq(residentPaymentReversals.branchId, scope.branchId),
        eq(residentPaymentReversals.stayId, scope.stayId),
      ),
    )
    .where(
      and(
        eq(residentPayments.branchId, scope.branchId),
        eq(residentPayments.stayId, scope.stayId),
        isNull(residentPaymentReversals.id),
      ),
    )
    .orderBy(
      desc(residentPayments.paidOn),
      desc(residentPayments.approvedAt),
      desc(residentPayments.id),
    )
    .limit(1);
  return payment ? { ...payment, amountPaisa: Number(payment.amountPaisa) } : null;
}
