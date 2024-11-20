import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError, stayIdentifierSchema, paymentReversalInputSchema } from '@hsm/contracts';
import {
  residentPayments,
  residentReceipts,
  residentPaymentReversals,
  residentLedger,
} from './schema/index.js';
import { paymentScopeSchema } from './resident-payment-context.js';
import { readResidentFundBalance } from './resident-fund-balance.js';
import type { PostingTransaction } from './resident-posting-context.js';
export const reversalCommandSchema = z
  .object({
    scope: paymentScopeSchema.extend({ actorRole: z.literal('owner') }).strict(),
    paymentId: stayIdentifierSchema,
    reversal: paymentReversalInputSchema,
  })
  .strict();
export type ReversalCommand = z.infer<typeof reversalCommandSchema>;
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Payment reversal data unavailable');
}
export async function requireReversiblePayment(tx: PostingTransaction, input: ReversalCommand) {
  const { scope, paymentId } = input;
  const [payment] = await tx
    .select({
      id: residentPayments.id,
      branchId: residentPayments.branchId,
      stayId: residentPayments.stayId,
      amountPaisa: residentPayments.amountPaisa,
      receiptId: residentReceipts.id,
    })
    .from(residentPayments)
    .innerJoin(
      residentReceipts,
      and(
        eq(residentReceipts.paymentId, residentPayments.id),
        eq(residentReceipts.branchId, residentPayments.branchId),
        eq(residentReceipts.stayId, residentPayments.stayId),
      ),
    )
    .where(
      and(
        eq(residentPayments.id, paymentId),
        eq(residentPayments.branchId, scope.branchId),
        eq(residentPayments.stayId, scope.stayId),
      ),
    )
    .for('update');
  if (!payment) throw new DomainError('NOT_FOUND', 404, 'Approved payment unavailable');
  if (
    payment.id !== paymentId ||
    payment.branchId !== scope.branchId ||
    payment.stayId !== scope.stayId ||
    !stayIdentifierSchema.safeParse(payment.receiptId).success ||
    typeof payment.amountPaisa !== 'bigint' ||
    payment.amountPaisa <= 0n ||
    payment.amountPaisa > BigInt(Number.MAX_SAFE_INTEGER)
  )
    unavailable();
  const [previous] = await tx
    .select({ id: residentPaymentReversals.id })
    .from(residentPaymentReversals)
    .where(
      and(
        eq(residentPaymentReversals.branchId, scope.branchId),
        eq(residentPaymentReversals.stayId, scope.stayId),
        eq(residentPaymentReversals.paymentId, paymentId),
      ),
    )
    .limit(1);
  if (previous) throw new DomainError('CONFLICT', 409, 'Payment already reversed');
  return payment;
}
const originalSchema = z.object({
  id: stayIdentifierSchema,
  branchId: stayIdentifierSchema,
  stayId: stayIdentifierSchema,
  paymentId: stayIdentifierSchema,
  fundingPaymentId: stayIdentifierSchema,
  account: z.enum(['receivable', 'deposit', 'advance']),
  side: z.literal('credit'),
  amountPaisa: z.bigint().positive().max(BigInt(Number.MAX_SAFE_INTEGER)),
  invoiceId: stayIdentifierSchema.nullable(),
});
export async function reversibleEntries(
  tx: PostingTransaction,
  input: ReversalCommand,
  amountPaisa: bigint,
) {
  const { scope, paymentId } = input;
  const rows = await tx
    .select()
    .from(residentLedger)
    .where(
      and(
        eq(residentLedger.branchId, scope.branchId),
        eq(residentLedger.stayId, scope.stayId),
        eq(residentLedger.paymentId, paymentId),
      ),
    )
    .orderBy(residentLedger.id)
    .limit(103);
  const parsed = z.array(originalSchema).min(1).max(102).safeParse(rows);
  if (!parsed.success) unavailable();
  const entries = parsed.data;
  if (
    entries.some(
      (row) =>
        row.branchId !== scope.branchId ||
        row.stayId !== scope.stayId ||
        row.paymentId !== paymentId ||
        row.fundingPaymentId !== paymentId ||
        (row.account === 'receivable') !== (row.invoiceId !== null),
    ) ||
    entries.reduce((sum, row) => sum + row.amountPaisa, 0n) !== amountPaisa
  )
    unavailable();
  const balance = await readResidentFundBalance(tx, {
    branchId: scope.branchId,
    stayId: scope.stayId,
    paymentId,
  });
  const held = entries.filter((row) => row.account !== 'receivable');
  if (
    held.some(
      (row) =>
        row.amountPaisa >
        BigInt(
          row.account === 'deposit' ? balance.deposit.heldPaisa : balance.advance.availablePaisa,
        ),
    )
  )
    throw new DomainError(
      'CONFLICT',
      409,
      'Resolve spent deposit or advance before reversing payment',
    );
  return entries;
}
export type ReversalEntries = Awaited<ReturnType<typeof reversibleEntries>>;
