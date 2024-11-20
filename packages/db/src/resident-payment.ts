import { z } from 'zod';
import {
  DomainError,
  recordExternalPaymentInputSchema,
  stayIdentifierSchema,
} from '@hsm/contracts';
import {
  paymentScopeSchema,
  lockPaymentParty,
  requireUnusedPaymentCommand,
  paymentReceiptAllocations,
  type PaymentScope,
} from './resident-payment-context.js';
import { writeApprovedResidentPayment } from './resident-payment-write.js';
import type { PostingTransaction } from './resident-posting-context.js';
const commandSchema = z
  .object({
    scope: paymentScopeSchema,
    commandId: stayIdentifierSchema,
    payment: recordExternalPaymentInputSchema,
  })
  .strict();
export type PaymentProofValidator = (
  tx: PostingTransaction,
  scope: PaymentScope,
  fileId: string,
) => Promise<void>;
// Internal human command only: caller holds live finance_view/payment_record and
// identity locks, owns idempotent transaction and required notification production.
// A supplied proof needs the caller's real file authorization inside this transaction.
export async function recordExternalResidentPayment(
  tx: PostingTransaction,
  value: unknown,
  clock: Date,
  validateProof?: PaymentProofValidator,
) {
  const input = commandSchema.parse(value),
    now = z.date().parse(clock);
  const party = await lockPaymentParty(tx, input.scope),
    sourceKey = 'external_payment:' + input.commandId;
  await requireUnusedPaymentCommand(tx, input.scope, sourceKey);
  if (input.payment.proofFileId !== undefined) {
    if (!validateProof)
      throw new DomainError('INTERNAL', 503, 'Payment proof validation unavailable');
    await validateProof(tx, input.scope, input.payment.proofFileId);
  }
  const allocations = await paymentReceiptAllocations(tx, input.scope, input.payment);
  return writeApprovedResidentPayment(
    tx,
    input.scope,
    party,
    input.payment,
    allocations,
    sourceKey,
    now,
  );
}
