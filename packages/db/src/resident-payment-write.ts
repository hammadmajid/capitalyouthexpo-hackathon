import { v7 } from 'uuid';
import {
  DomainError,
  residentReceiptSnapshotSchema,
  type RecordExternalPaymentInput,
} from '@hsm/contracts';
import {
  residentPayments,
  residentReceipts,
  residentLedger,
  hostelAuditLog,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import type {
  PaymentParty,
  PaymentScope,
  paymentReceiptAllocations,
} from './resident-payment-context.js';
type Allocations = Awaited<ReturnType<typeof paymentReceiptAllocations>>;
function receiptSnapshot(
  scope: PaymentScope,
  party: PaymentParty,
  payment: RecordExternalPaymentInput,
  allocations: Allocations,
  paymentId: string,
  now: Date,
) {
  const allocatedPaisa = Number(
    allocations.reduce((sum, row) => sum + BigInt(row.amountPaisa), 0n),
  );
  const parsed = residentReceiptSnapshotSchema.safeParse({
    version: 1,
    currency: 'PKR',
    paymentId,
    branchId: scope.branchId,
    stayId: scope.stayId,
    residentName: party.residentName,
    hostelName: party.hostelName,
    branchName: party.branchName,
    amountPaisa: payment.amountPaisa,
    method: payment.method,
    transactionReference: payment.transactionReference ?? null,
    paidOn: payment.paidOn,
    approvedAt: now.toISOString(),
    allocations,
    distribution: {
      allocatedPaisa,
      depositPaisa: payment.depositPaisa,
      advanceCreditPaisa: payment.advanceCreditPaisa,
    },
  });
  if (!parsed.success) throw new DomainError('INTERNAL', 500, 'Payment receipt data unavailable');
  return parsed.data;
}
function paymentEntries(
  scope: PaymentScope,
  payment: RecordExternalPaymentInput,
  paymentId: string,
  now: Date,
) {
  const common = {
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId,
    fundingPaymentId: paymentId,
    side: 'credit' as const,
    postedAt: now,
  };
  const rows: (typeof residentLedger.$inferInsert)[] = payment.allocations.map((row) => ({
    ...common,
    id: v7(),
    account: 'receivable',
    invoiceId: row.invoiceId,
    amountPaisa: BigInt(row.amountPaisa),
  }));
  if (payment.depositPaisa > 0)
    rows.push({
      ...common,
      id: v7(),
      account: 'deposit',
      amountPaisa: BigInt(payment.depositPaisa),
    });
  if (payment.advanceCreditPaisa > 0)
    rows.push({
      ...common,
      id: v7(),
      account: 'advance',
      amountPaisa: BigInt(payment.advanceCreditPaisa),
    });
  return rows;
}
// PAY-008/009 / AUD-004: approved human receipt, explicit ledger partition and audit
// commit together. No money movement, bank-verification flag or mutable Paid column.
export async function writeApprovedResidentPayment(
  tx: PostingTransaction,
  scope: PaymentScope,
  party: PaymentParty,
  payment: RecordExternalPaymentInput,
  allocations: Allocations,
  sourceKey: string,
  now: Date,
) {
  const paymentId = v7(),
    receiptId = v7(),
    receiptNumber = 'R-' + paymentId;
  const snapshot = receiptSnapshot(scope, party, payment, allocations, paymentId, now);
  await tx.insert(residentPayments).values({
    id: paymentId,
    branchId: scope.branchId,
    stayId: scope.stayId,
    sourceKey,
    amountPaisa: BigInt(payment.amountPaisa),
    method: payment.method,
    transactionReference: payment.transactionReference ?? null,
    proofFileId: payment.proofFileId ?? null,
    paidOn: payment.paidOn,
    approvedByUserId: scope.actorUserId,
    approvedAt: now,
    note: payment.note,
  });
  await tx.insert(residentReceipts).values({
    id: receiptId,
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId,
    number: receiptNumber,
    snapshot,
    issuedAt: now,
  });
  await tx.insert(residentLedger).values(paymentEntries(scope, payment, paymentId, now));
  await recordPaymentAudit(tx, scope, party, payment, paymentId, receiptId, snapshot, now);
  return { paymentId, receiptId, receiptNumber, amountPaisa: payment.amountPaisa };
}

async function recordPaymentAudit(
  tx: PostingTransaction,
  scope: PaymentScope,
  party: PaymentParty,
  payment: RecordExternalPaymentInput,
  paymentId: string,
  receiptId: string,
  snapshot: ReturnType<typeof receiptSnapshot>,
  now: Date,
) {
  await tx.insert(hostelAuditLog).values({
    organizationId: party.organizationId,
    branchId: scope.branchId,
    actorUserId: scope.actorUserId,
    actorRole: scope.actorRole,
    action: 'resident.payment.recorded',
    targetType: 'resident_payment',
    targetId: paymentId,
    after: {
      paymentId,
      receiptId,
      amountPaisa: payment.amountPaisa,
      distribution: snapshot.distribution,
    },
    createdAt: now,
  });
}
