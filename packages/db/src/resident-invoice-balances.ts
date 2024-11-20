import { and, asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  billingGraceDaysSchema,
  databaseDateSchema,
  DomainError,
  stayIdentifierSchema,
} from '@hsm/contracts';
import { residentInvoices, stays } from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
import { projectInvoiceBalance } from './resident-invoice-balance.js';
import {
  invoiceBatchAdjustmentTotals,
  invoiceBatchReceiptAllocations,
  invoiceBatchAgreedGraceDays,
} from './resident-invoice-totals.js';

const inputSchema = z
  .object({
    branchId: stayIdentifierSchema,
    today: databaseDateSchema,
    invoices: z
      .array(z.object({ invoiceId: stayIdentifierSchema, stayId: stayIdentifierSchema }).strict())
      .min(1)
      .max(100),
  })
  .strict()
  .refine(
    (value) => new Set(value.invoices.map((row) => row.invoiceId)).size === value.invoices.length,
  );
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Invoice financial data unavailable');
}
// FIN-001 / AUD-005/012: bounded query batches share the exact single-invoice
// receipt/adjustment/grace queries and projection. Callers authorize the branch.
// Lock every referenced Stay before reading financial facts, in stable ID order.
export async function readResidentInvoiceBalances(transaction: PostingTransaction, value: unknown) {
  const input = inputSchema.parse(value);
  const stayIds = [...new Set(input.invoices.map((row) => row.stayId))];
  const locked = await transaction
    .select({ id: stays.id, branchId: stays.branchId })
    .from(stays)
    .where(and(eq(stays.branchId, input.branchId), inArray(stays.id, stayIds)))
    .orderBy(asc(stays.id))
    .for('share');
  if (
    locked.length !== stayIds.length ||
    locked.some((row) => row.branchId !== input.branchId || !stayIds.includes(row.id))
  )
    throw new DomainError('NOT_FOUND', 404, 'Stay unavailable');
  const scope = {
    branchId: input.branchId,
    invoiceIds: input.invoices.map((row) => row.invoiceId),
  };
  const invoices = await transaction
    .select()
    .from(residentInvoices)
    .where(
      and(
        eq(residentInvoices.branchId, input.branchId),
        inArray(residentInvoices.id, scope.invoiceIds),
      ),
    );
  const requested = new Map(input.invoices.map((row) => [row.invoiceId, row.stayId]));
  if (
    invoices.length !== requested.size ||
    invoices.some((row) => row.branchId !== input.branchId || requested.get(row.id) !== row.stayId)
  )
    throw new DomainError('NOT_FOUND', 404, 'Invoice unavailable');
  const adjustments = await invoiceBatchAdjustmentTotals(transaction, scope);
  const allocations = await invoiceBatchReceiptAllocations(transaction, scope);
  const grace = await invoiceBatchAgreedGraceDays(transaction, scope);
  const adjustmentMap = new Map(adjustments.map((row) => [row.invoiceId, row]));
  const allocationMap = new Map(allocations.map((row) => [row.invoiceId, row]));
  if (
    adjustmentMap.size !== adjustments.length ||
    allocationMap.size !== allocations.length ||
    adjustments.some((row) => !requested.has(row.invoiceId)) ||
    allocations.some((row) => row.invoiceId === null || !requested.has(row.invoiceId))
  )
    unavailable();
  const graceMap = new Map<string, number>();
  for (const row of grace) {
    const parsed = billingGraceDaysSchema.safeParse(row.graceDays);
    if (!parsed.success || !requested.has(row.invoiceId) || graceMap.has(row.invoiceId))
      unavailable();
    graceMap.set(row.invoiceId, parsed.data);
  }
  return invoices.map((invoice) => {
    const graceDays = graceMap.get(invoice.id);
    if (graceDays === undefined) unavailable();
    return projectInvoiceBalance(
      invoice,
      adjustmentMap.get(invoice.id) ?? { debit: '0', credit: '0' },
      allocationMap.get(invoice.id) ?? { allocated: '0' },
      graceDays,
      input.today,
    );
  });
}
