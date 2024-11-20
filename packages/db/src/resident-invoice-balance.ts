import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import {
  databaseDateSchema,
  billingGraceDaysSchema,
  DomainError,
  invoiceBalance,
  money,
  moneyToJson,
  stayIdentifierSchema,
  stayPrivateText,
} from '@hsm/contracts';
import { stays, residentInvoices } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import {
  invoiceAdjustmentTotals,
  invoiceReceiptAllocations,
  invoiceAgreedGraceDays,
  type InvoiceScope,
} from './resident-invoice-totals.js';
const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    stayId: stayIdentifierSchema,
    invoiceId: stayIdentifierSchema,
    today: databaseDateSchema,
  })
  .strict();
const max = BigInt(Number.MAX_SAFE_INTEGER);
const storedInvoiceSchema = z.object({
  number: stayPrivateText(64),
  dueDate: databaseDateSchema,
  state: z.enum(['issued', 'voided']),
  totalPaisa: z.bigint().nonnegative().max(max),
});
const integerText = z.string().regex(/^(0|[1-9]\d{0,15})$/);
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Invoice financial data unavailable');
}
function exactAmount(value: unknown) {
  const parsed = integerText.safeParse(value);
  if (!parsed.success) unavailable();
  const amount = BigInt(parsed.data);
  if (amount > max) unavailable();
  return moneyToJson(money(amount));
}
async function agreedGrace(transaction: PostingTransaction, scope: InvoiceScope) {
  const rows = await invoiceAgreedGraceDays(transaction, scope),
    row = rows[0];
  if (rows.length !== 1 || !row) unavailable();
  const value = billingGraceDaysSchema.safeParse(row.graceDays);
  if (!value.success) unavailable();
  return value.data;
}
async function lockStay(transaction: PostingTransaction, scope: InvoiceScope) {
  const [stay] = await transaction
    .select({ id: stays.id, branchId: stays.branchId })
    .from(stays)
    .where(and(eq(stays.branchId, scope.branchId), eq(stays.id, scope.stayId)))
    .for('share');
  if (!stay) throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  if (stay.id !== scope.stayId || stay.branchId !== scope.branchId) unavailable();
}
export function projectInvoiceBalance(
  invoice: typeof residentInvoices.$inferSelect,
  adjustments: { debit: string; credit: string } | undefined,
  allocation: { allocated: string } | undefined,
  graceDays: number,
  today: string,
) {
  const parsed = storedInvoiceSchema.safeParse(invoice);
  if (!parsed.success || !adjustments || !allocation) unavailable();
  const totals = {
    totalPaisa: moneyToJson(money(parsed.data.totalPaisa)),
    debitAdjustmentsPaisa: exactAmount(adjustments.debit),
    creditAdjustmentsPaisa: exactAmount(adjustments.credit),
    allocatedPaisa: exactAmount(allocation.allocated),
  };
  try {
    return {
      invoiceId: invoice.id,
      invoiceNumber: parsed.data.number,
      currency: 'PKR' as const,
      dueDate: parsed.data.dueDate,
      graceDays,
      ...invoiceBalance({
        totals,
        dueDate: parsed.data.dueDate,
        today,
        graceDays,
        voided: parsed.data.state === 'voided',
      }),
    };
  } catch {
    unavailable();
  }
}
// FIN-001 / PAY-008: internal read; caller first authorizes live branch/resource access.
// The caller supplies server-derived Karachi today. Shared Stay lock stabilizes the bounded financial reads
// against financial writers, which must acquire the Stay lock before changing its finances.
// Historical/terminal Stays remain readable; this helper never authorizes or mutates a payment.
export async function readResidentInvoiceBalance(transaction: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value);
  await lockStay(transaction, input);
  const [invoice] = await transaction
    .select()
    .from(residentInvoices)
    .where(
      and(
        eq(residentInvoices.branchId, input.branchId),
        eq(residentInvoices.stayId, input.stayId),
        eq(residentInvoices.id, input.invoiceId),
      ),
    )
    .limit(1);
  if (!invoice) throw new DomainError('NOT_FOUND', 404, 'Invoice unavailable');
  if (
    invoice.id !== input.invoiceId ||
    invoice.branchId !== input.branchId ||
    invoice.stayId !== input.stayId
  )
    unavailable();
  const graceDays = await agreedGrace(transaction, input);
  const adjustments = await invoiceAdjustmentTotals(transaction, input),
    allocation = await invoiceReceiptAllocations(transaction, input);
  if (adjustments.length !== 1 || allocation.length !== 1) unavailable();
  return projectInvoiceBalance(invoice, adjustments[0], allocation[0], graceDays, input.today);
}
