import { v7 } from 'uuid';
import { z } from 'zod';
import { residentPaymentReversals, residentLedger, hostelAuditLog } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { lockPaymentParty } from './resident-payment-context.js';
import {
  reversalCommandSchema,
  requireReversiblePayment,
  reversibleEntries,
  type ReversalCommand,
  type ReversalEntries,
} from './resident-reversal-context.js';
// Q14 / PAY-008: Owner-only internal source command. Caller proves actual owning
// authority, live identity, idempotency and mandatory notice in the same transaction.
// Original receipts remain immutable; spent funds require explicit resolution first.
export async function reverseResidentPayment(tx: PostingTransaction, value: unknown, clock: Date) {
  const input = reversalCommandSchema.parse(value),
    now = z.date().parse(clock),
    party = await lockPaymentParty(tx, input.scope),
    payment = await requireReversiblePayment(tx, input),
    original = await reversibleEntries(tx, input, payment.amountPaisa),
    id = v7();
  await tx.insert(residentPaymentReversals).values({
    id,
    branchId: input.scope.branchId,
    stayId: input.scope.stayId,
    paymentId: input.paymentId,
    reason: input.reversal.reason,
    approvedByUserId: input.scope.actorUserId,
    approvedAt: now,
  });
  await tx.insert(residentLedger).values(oppositeEntries(input, original, id, now));
  await writeAudit(tx, input, id, party.organizationId, now);
  return { reversalId: id, paymentId: input.paymentId, receiptId: payment.receiptId };
}
function oppositeEntries(
  input: ReversalCommand,
  original: ReversalEntries,
  reversalId: string,
  now: Date,
) {
  return original.map((row) => ({
    id: v7(),
    branchId: input.scope.branchId,
    stayId: input.scope.stayId,
    account: row.account,
    side: 'debit' as const,
    amountPaisa: row.amountPaisa,
    invoiceId: row.invoiceId,
    paymentReversalId: reversalId,
    fundingPaymentId: input.paymentId,
    reversedEntryId: row.id,
    postedAt: now,
  }));
}
async function writeAudit(
  tx: PostingTransaction,
  input: ReversalCommand,
  id: string,
  organizationId: string,
  now: Date,
) {
  await tx.insert(hostelAuditLog).values({
    organizationId,
    branchId: input.scope.branchId,
    actorUserId: input.scope.actorUserId,
    actorRole: 'owner',
    action: 'resident.payment.reversed',
    targetType: 'resident_payment_reversal',
    targetId: id,
    after: { paymentId: input.paymentId, reason: input.reversal.reason },
    createdAt: now,
  });
}
