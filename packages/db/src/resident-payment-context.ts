import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { DomainError, stayIdentifierSchema, type RecordExternalPaymentInput } from '@hsm/contracts';
import { stays, residents, residentPayments } from './schema/index.js';
import { lockInventoryBranch } from './inventory-lock.js';
import { readResidentInvoiceBalance } from './resident-invoice-balance.js';
import type { PostingTransaction } from './resident-posting-context.js';
export const paymentScopeSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    actorUserId: stayIdentifierSchema,
    actorRole: z.enum(['owner', 'manager']),
  })
  .strict();
export type PaymentScope = z.infer<typeof paymentScopeSchema>;
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Payment party data unavailable');
}
export async function lockPaymentParty(tx: PostingTransaction, scope: PaymentScope) {
  const hierarchy = await lockInventoryBranch(tx, scope.branchId);
  if (
    [hierarchy.organization, hierarchy.brand, hierarchy.branch].some(
      (row) => row.archivedAt !== null,
    )
  )
    throw new DomainError('BRANCH_FORBIDDEN', 403, 'Branch unavailable');
  const [stay] = await tx
    .select()
    .from(stays)
    .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
    .for('update');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== scope.stayId || stay.branchId !== scope.branchId) unavailable();
  const [resident] = await tx
    .select()
    .from(residents)
    .where(and(eq(residents.branchId, scope.branchId), eq(residents.id, stay.residentId)))
    .for('share');
  if (!resident || resident.id !== stay.residentId || resident.branchId !== scope.branchId)
    unavailable();
  return {
    organizationId: hierarchy.organization.id,
    residentName: resident.displayName,
    hostelName: hierarchy.brand.name,
    branchName: hierarchy.branch.name,
  };
}
export async function requireUnusedPaymentCommand(
  tx: PostingTransaction,
  scope: PaymentScope,
  sourceKey: string,
) {
  const [previous] = await tx
    .select({ id: residentPayments.id })
    .from(residentPayments)
    .where(
      and(
        eq(residentPayments.branchId, scope.branchId),
        eq(residentPayments.stayId, scope.stayId),
        eq(residentPayments.sourceKey, sourceKey),
      ),
    )
    .limit(1);
  if (previous) throw new DomainError('CONFLICT', 409, 'Payment command already recorded');
}
export async function paymentReceiptAllocations(
  tx: PostingTransaction,
  scope: PaymentScope,
  payment: RecordExternalPaymentInput,
) {
  const result = [];
  for (const row of payment.allocations) {
    const invoice = await readResidentInvoiceBalance(tx, {
      branchId: scope.branchId,
      stayId: scope.stayId,
      invoiceId: row.invoiceId,
      today: payment.paidOn,
    });
    if (invoice.state === 'voided' || BigInt(row.amountPaisa) > BigInt(invoice.outstandingPaisa))
      throw new DomainError('CONFLICT', 409, 'Allocation exceeds invoice outstanding');
    result.push({ ...row, invoiceNumber: invoice.invoiceNumber });
  }
  return result;
}
export type PaymentParty = Awaited<ReturnType<typeof lockPaymentParty>>;
