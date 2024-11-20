import { and, eq, inArray } from 'drizzle-orm';
import { v7 } from 'uuid';
import { z } from 'zod';
import { DomainError, invoiceReissueInputSchema, stayIdentifierSchema } from '@hsm/contracts';
import {
  hostelAuditLog,
  residentChargeAdjustments,
  residentCharges,
  residentInvoiceCharges,
  residentInvoices,
  residentLedger,
  residentPaymentProofInvoices,
  residentPaymentProofs,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { lockPaymentParty, paymentScopeSchema } from './resident-payment-context.js';
import { REISSUE_KEY_PREFIX } from './resident-charge-posting.js';
import { invoiceAdjustmentTotals, invoiceReceiptAllocations } from './resident-invoice-totals.js';
export const invoiceReissueCommandSchema = z
  .object({
    scope: paymentScopeSchema.extend({ actorRole: z.literal('owner') }).strict(),
    invoiceId: stayIdentifierSchema,
    reissue: invoiceReissueInputSchema,
  })
  .strict();
type Command = z.infer<typeof invoiceReissueCommandSchema>;
type Charge = typeof residentCharges.$inferSelect;
function refuse(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
// CHG-053 / RENT-003: Owner-only. Only a wholly unpaid, unadjusted bill with no proof under
// review can be cancelled. The old bill is voided (kept, with reason); each charge is credited
// in full by a correction and copied once onto one new bill with the corrected due date.
export async function reissueResidentInvoice(tx: PostingTransaction, value: unknown, clock: Date) {
  const input = invoiceReissueCommandSchema.parse(value),
    now = z.date().parse(clock),
    party = await lockPaymentParty(tx, input.scope),
    invoice = await lockIssuedInvoice(tx, input);
  await requireUntouched(tx, input);
  const charges = await chargesOf(tx, input);
  if (charges.some((row) => row.periodStart !== null && input.reissue.dueDate < row.periodStart))
    throw new DomainError('VALIDATION_FAILED', 400, 'Due date is before the bill period starts');
  const invoiceId = v7();
  await tx
    .update(residentInvoices)
    .set({
      state: 'voided',
      voidedAt: now,
      voidedByUserId: input.scope.actorUserId,
      voidReason: input.reissue.reason,
    })
    .where(eq(residentInvoices.id, invoice.id));
  const copies = await creditAndCopy(tx, input, charges, invoiceId, now);
  await issueReplacement(tx, input, invoiceId, copies, now);
  await tx.insert(hostelAuditLog).values({
    organizationId: party.organizationId,
    branchId: input.scope.branchId,
    actorUserId: input.scope.actorUserId,
    actorRole: 'owner',
    action: 'resident.invoice.reissued',
    targetType: 'resident_invoice',
    targetId: invoiceId,
    before: { invoiceId: invoice.id, dueDate: invoice.dueDate },
    after: { invoiceId, dueDate: input.reissue.dueDate, reason: input.reissue.reason },
    createdAt: now,
  });
  return { voidedInvoiceId: invoice.id, invoiceId };
}
async function lockIssuedInvoice(tx: PostingTransaction, input: Command) {
  const [invoice] = await tx
    .select()
    .from(residentInvoices)
    .where(
      and(
        eq(residentInvoices.branchId, input.scope.branchId),
        eq(residentInvoices.stayId, input.scope.stayId),
        eq(residentInvoices.id, input.invoiceId),
      ),
    )
    .for('update');
  if (!invoice) throw new DomainError('NOT_FOUND', 404, 'Invoice unavailable');
  if (invoice.state !== 'issued') refuse('This bill is already cancelled');
  return invoice;
}
async function requireUntouched(tx: PostingTransaction, input: Command) {
  const scope = { ...input.scope, invoiceId: input.invoiceId };
  const [adjusted] = await invoiceAdjustmentTotals(tx, scope),
    [allocated] = await invoiceReceiptAllocations(tx, scope);
  if (!adjusted || !allocated) throw new DomainError('INTERNAL', 500, 'Invoice data unavailable');
  if (allocated.allocated !== '0') refuse('A paid bill cannot be cancelled');
  if (adjusted.debit !== '0' || adjusted.credit !== '0')
    refuse('An adjusted bill cannot be cancelled');
  const [direct] = await tx
    .select({ id: residentPaymentProofs.id })
    .from(residentPaymentProofs)
    .where(
      and(
        eq(residentPaymentProofs.branchId, input.scope.branchId),
        eq(residentPaymentProofs.invoiceId, input.invoiceId),
        eq(residentPaymentProofs.state, 'submitted'),
      ),
    )
    .limit(1);
  const [covered] = await tx
    .select({ id: residentPaymentProofs.id })
    .from(residentPaymentProofInvoices)
    .innerJoin(
      residentPaymentProofs,
      eq(residentPaymentProofs.id, residentPaymentProofInvoices.proofId),
    )
    .where(
      and(
        eq(residentPaymentProofInvoices.branchId, input.scope.branchId),
        eq(residentPaymentProofInvoices.invoiceId, input.invoiceId),
        eq(residentPaymentProofs.state, 'submitted'),
      ),
    )
    .limit(1);
  if (direct || covered) refuse('Review the payment proof for this bill first');
}
async function chargesOf(tx: PostingTransaction, input: Command) {
  const links = await tx
    .select({ chargeId: residentInvoiceCharges.chargeId })
    .from(residentInvoiceCharges)
    .where(
      and(
        eq(residentInvoiceCharges.branchId, input.scope.branchId),
        eq(residentInvoiceCharges.stayId, input.scope.stayId),
        eq(residentInvoiceCharges.invoiceId, input.invoiceId),
      ),
    )
    .limit(101);
  if (!links.length || links.length > 100)
    throw new DomainError('INTERNAL', 500, 'Invoice charges unavailable');
  const rows = await tx
    .select()
    .from(residentCharges)
    .where(
      and(
        eq(residentCharges.branchId, input.scope.branchId),
        eq(residentCharges.stayId, input.scope.stayId),
        inArray(
          residentCharges.id,
          links.map((row) => row.chargeId),
        ),
      ),
    )
    .orderBy(residentCharges.id);
  if (rows.length !== links.length)
    throw new DomainError('INTERNAL', 500, 'Invoice charges unavailable');
  return rows;
}
async function creditAndCopy(
  tx: PostingTransaction,
  input: Command,
  charges: Charge[],
  invoiceId: string,
  now: Date,
) {
  const scope = { branchId: input.scope.branchId, stayId: input.scope.stayId };
  const copies: { id: string; amountPaisa: bigint }[] = [];
  for (const [index, charge] of charges.entries()) {
    const adjustmentId = v7(),
      copyId = v7(),
      key = REISSUE_KEY_PREFIX + invoiceId + ':' + index;
    await tx.insert(residentChargeAdjustments).values({
      ...scope,
      id: adjustmentId,
      chargeId: charge.id,
      kind: 'correction',
      sourceKey: key,
      side: 'credit',
      amountPaisa: charge.amountPaisa,
      reason: input.reissue.reason,
      postedByUserId: input.scope.actorUserId,
      postedAt: now,
    });
    await tx.insert(residentCharges).values({
      ...charge,
      id: copyId,
      sourceKey: key,
      postedByUserId: input.scope.actorUserId,
      postedAt: now,
    });
    await tx.insert(residentLedger).values([
      {
        ...scope,
        id: v7(),
        adjustmentId,
        account: 'receivable',
        side: 'credit',
        amountPaisa: charge.amountPaisa,
        postedAt: now,
      },
      {
        ...scope,
        id: v7(),
        chargeId: copyId,
        account: 'receivable',
        side: 'debit',
        amountPaisa: charge.amountPaisa,
        postedAt: now,
      },
    ]);
    copies.push({ id: copyId, amountPaisa: charge.amountPaisa });
  }
  return copies;
}
async function issueReplacement(
  tx: PostingTransaction,
  input: Command,
  invoiceId: string,
  copies: { id: string; amountPaisa: bigint }[],
  now: Date,
) {
  const scope = { branchId: input.scope.branchId, stayId: input.scope.stayId };
  await tx.insert(residentInvoices).values({
    ...scope,
    id: invoiceId,
    number: 'INV-' + invoiceId.replaceAll('-', '').toUpperCase(),
    totalPaisa: copies.reduce((sum, row) => sum + row.amountPaisa, 0n),
    dueDate: input.reissue.dueDate,
    state: 'issued',
    issuedByUserId: input.scope.actorUserId,
    issuedAt: now,
  });
  await tx
    .insert(residentInvoiceCharges)
    .values(copies.map((row) => ({ ...scope, id: v7(), invoiceId, chargeId: row.id })));
}
