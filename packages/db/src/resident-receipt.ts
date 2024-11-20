import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  DomainError,
  stayIdentifierSchema,
  stayPrivateText,
  residentReceiptSnapshotSchema,
  type ResidentReceiptSnapshot,
} from '@hsm/contracts';
import {
  stays,
  residentPayments,
  residentReceipts,
  residentPaymentReversals,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
const scopeSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    receiptId: stayIdentifierSchema,
  })
  .strict();
type Scope = z.infer<typeof scopeSchema>;
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Receipt financial data unavailable');
}
async function lockStay(tx: PostingTransaction, scope: Scope) {
  const [stay] = await tx
    .select({ id: stays.id, branchId: stays.branchId })
    .from(stays)
    .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
    .for('share');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== scope.stayId || stay.branchId !== scope.branchId) unavailable();
}
function projectReceipt(
  row: {
    receipt: typeof residentReceipts.$inferSelect;
    payment: typeof residentPayments.$inferSelect;
  },
  scope: Scope,
) {
  const { receipt, payment } = row;
  const snapshot = residentReceiptSnapshotSchema.safeParse(receipt.snapshot);
  const number = stayPrivateText(64).safeParse(receipt.number);
  const issuedAt = z.date().safeParse(receipt.issuedAt);
  const approvedAt = z.date().safeParse(payment.approvedAt);
  if (!snapshot.success || !number.success || !issuedAt.success || !approvedAt.success)
    unavailable();
  const facts = snapshot.data;
  assertReceiptScope(row, scope);
  assertPaymentFacts(facts, payment, approvedAt.data);
  return {
    receiptId: scope.receiptId,
    receiptNumber: number.data,
    issuedAt: issuedAt.data.toISOString(),
    snapshot: facts,
  };
}
type ReceiptRow = {
  receipt: typeof residentReceipts.$inferSelect;
  payment: typeof residentPayments.$inferSelect;
};
function assertReceiptScope({ receipt, payment }: ReceiptRow, scope: Scope) {
  if (
    receipt.id !== scope.receiptId ||
    receipt.branchId !== scope.branchId ||
    receipt.stayId !== scope.stayId ||
    payment.id !== receipt.paymentId ||
    payment.branchId !== scope.branchId ||
    payment.stayId !== scope.stayId
  )
    unavailable();
}
function assertPaymentFacts(
  facts: ResidentReceiptSnapshot,
  payment: typeof residentPayments.$inferSelect,
  approvedAt: Date,
) {
  if (
    facts.paymentId !== payment.id ||
    facts.branchId !== payment.branchId ||
    facts.stayId !== payment.stayId ||
    BigInt(facts.amountPaisa) !== payment.amountPaisa ||
    facts.method !== payment.method ||
    facts.paidOn !== payment.paidOn ||
    facts.transactionReference !== payment.transactionReference ||
    facts.approvedAt !== approvedAt.toISOString()
  )
    unavailable();
}
async function wasReversed(tx: PostingTransaction, scope: Scope, paymentId: string) {
  const rows = await tx
    .select({
      id: residentPaymentReversals.id,
      branchId: residentPaymentReversals.branchId,
      stayId: residentPaymentReversals.stayId,
      paymentId: residentPaymentReversals.paymentId,
    })
    .from(residentPaymentReversals)
    .where(
      and(
        eq(residentPaymentReversals.branchId, scope.branchId),
        eq(residentPaymentReversals.stayId, scope.stayId),
        eq(residentPaymentReversals.paymentId, paymentId),
      ),
    )
    .limit(2);
  if (
    rows.length > 1 ||
    rows.some(
      (row) =>
        row.branchId !== scope.branchId ||
        row.stayId !== scope.stayId ||
        row.paymentId !== paymentId ||
        !stayIdentifierSchema.safeParse(row.id).success,
    )
  )
    unavailable();
  return rows.length === 1;
}
// FIN-001 / PAY-008 / SEC-003: internal private read; live caller authorization is mandatory.
// Shared Stay lock stabilizes approved payment/reversal facts. Historical names remain immutable.
export async function readResidentReceipt(tx: PostingTransaction, value: unknown) {
  const scope = scopeSchema.parse(value);
  await lockStay(tx, scope);
  const rows = await tx
    .select({ receipt: residentReceipts, payment: residentPayments })
    .from(residentReceipts)
    .innerJoin(
      residentPayments,
      and(
        eq(residentPayments.id, residentReceipts.paymentId),
        eq(residentPayments.branchId, residentReceipts.branchId),
        eq(residentPayments.stayId, residentReceipts.stayId),
      ),
    )
    .where(
      and(
        eq(residentReceipts.id, scope.receiptId),
        eq(residentReceipts.branchId, scope.branchId),
        eq(residentReceipts.stayId, scope.stayId),
      ),
    )
    .limit(2);
  const row = rows[0];
  if (!row) throw new DomainError('NOT_FOUND', 404, 'Receipt unavailable');
  if (rows.length !== 1) unavailable();
  const result = projectReceipt(row, scope);
  return { ...result, reversed: await wasReversed(tx, scope, result.snapshot.paymentId) };
}
