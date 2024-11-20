import { and, eq, inArray, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  residentChargeAdjustments,
  residentCharges,
  stayAgreements,
  residentInvoiceCharges,
  residentLedger,
  residentPayments,
  residentReceipts,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
export type InvoiceScope = { branchId: string; stayId: string; invoiceId: string };
export type InvoiceBatchScope = { branchId: string; invoiceIds: string[] };
type Scope = InvoiceScope | InvoiceBatchScope;
function condition(
  scope: Scope,
  branch: AnyPgColumn,
  stay: AnyPgColumn,
  invoice: AnyPgColumn,
  receivable = false,
) {
  return and(
    eq(branch, scope.branchId),
    'stayId' in scope ? eq(stay, scope.stayId) : undefined,
    receivable ? eq(residentLedger.account, 'receivable') : undefined,
    'invoiceIds' in scope ? inArray(invoice, scope.invoiceIds) : eq(invoice, scope.invoiceId),
  );
}
const adjustmentFields = {
  debit: sql<string>`coalesce(sum(case when ${residentLedger.side} = 'debit' then ${residentLedger.amountPaisa} else 0 end),0)::text`,
  credit: sql<string>`coalesce(sum(case when ${residentLedger.side} = 'credit' then ${residentLedger.amountPaisa} else 0 end),0)::text`,
};
// Indexed server-side sums return one row, never a loaded history collection.
export function invoiceAdjustmentTotals(transaction: PostingTransaction, scope: InvoiceScope) {
  return adjustmentRows(transaction, scope);
}
export function invoiceBatchAdjustmentTotals(
  transaction: PostingTransaction,
  scope: InvoiceBatchScope,
) {
  return adjustmentRows(transaction, scope).groupBy(residentInvoiceCharges.invoiceId);
}
function adjustmentRows(transaction: PostingTransaction, scope: Scope) {
  return transaction
    .select({
      ...adjustmentFields,
      invoiceId: sql<string>`${'invoiceIds' in scope ? residentInvoiceCharges.invoiceId : scope.invoiceId}`,
    })
    .from(residentLedger)
    .$dynamic()
    .innerJoin(
      residentChargeAdjustments,
      and(
        eq(residentChargeAdjustments.id, residentLedger.adjustmentId),
        eq(residentChargeAdjustments.branchId, residentLedger.branchId),
        eq(residentChargeAdjustments.stayId, residentLedger.stayId),
      ),
    )
    .innerJoin(
      residentInvoiceCharges,
      and(
        eq(residentInvoiceCharges.chargeId, residentChargeAdjustments.chargeId),
        eq(residentInvoiceCharges.branchId, residentLedger.branchId),
        eq(residentInvoiceCharges.stayId, residentLedger.stayId),
      ),
    )
    .where(
      and(
        condition(
          scope,
          residentLedger.branchId,
          residentLedger.stayId,
          residentInvoiceCharges.invoiceId,
          true,
        ),
      ),
    );
}
// Funding links cover direct allocations, fund applications and their exact opposite reversals.
// A proof upload is absent here; approved external payments must JOIN their immutable receipt.
export function invoiceReceiptAllocations(transaction: PostingTransaction, scope: InvoiceScope) {
  return allocationRows(transaction, scope);
}
const allocationFields = {
  allocated: sql<string>`coalesce(sum(case when ${residentLedger.side} = 'credit' then ${residentLedger.amountPaisa} else -${residentLedger.amountPaisa} end),0)::text`,
};
export function invoiceBatchReceiptAllocations(
  transaction: PostingTransaction,
  scope: InvoiceBatchScope,
) {
  return allocationRows(transaction, scope).groupBy(residentLedger.invoiceId);
}
function allocationRows(transaction: PostingTransaction, scope: Scope) {
  return transaction
    .select({
      ...allocationFields,
      invoiceId: sql<string>`${'invoiceIds' in scope ? residentLedger.invoiceId : scope.invoiceId}`,
    })
    .from(residentLedger)
    .$dynamic()
    .innerJoin(
      residentPayments,
      and(
        eq(residentPayments.id, residentLedger.fundingPaymentId),
        eq(residentPayments.branchId, residentLedger.branchId),
        eq(residentPayments.stayId, residentLedger.stayId),
      ),
    )
    .innerJoin(
      residentReceipts,
      and(
        eq(residentReceipts.paymentId, residentPayments.id),
        eq(residentReceipts.branchId, residentLedger.branchId),
        eq(residentReceipts.stayId, residentLedger.stayId),
      ),
    )
    .where(
      and(
        condition(
          scope,
          residentLedger.branchId,
          residentLedger.stayId,
          residentLedger.invoiceId,
          true,
        ),
      ),
    );
}

// Original immutable agreement facts, never the branch's current policy. Two distinct
// values suffice to detect ambiguity without loading an agreement history collection.
export function invoiceAgreedGraceDays(transaction: PostingTransaction, scope: InvoiceScope) {
  return graceRows(transaction, scope).limit(2);
}
const graceFields = {
  graceDays: sql<unknown>`${stayAgreements.termsSnapshot}->'policy'->'graceDays'`,
};
export function invoiceBatchAgreedGraceDays(
  transaction: PostingTransaction,
  scope: InvoiceBatchScope,
) {
  return graceRows(transaction, scope);
}
function graceRows(transaction: PostingTransaction, scope: Scope) {
  return transaction
    .selectDistinct({
      ...graceFields,
      invoiceId: sql<string>`${'invoiceIds' in scope ? residentInvoiceCharges.invoiceId : scope.invoiceId}`,
    })
    .from(residentInvoiceCharges)
    .$dynamic()
    .innerJoin(
      residentCharges,
      and(
        eq(residentCharges.id, residentInvoiceCharges.chargeId),
        eq(residentCharges.branchId, residentInvoiceCharges.branchId),
        eq(residentCharges.stayId, residentInvoiceCharges.stayId),
      ),
    )
    .innerJoin(
      stayAgreements,
      and(
        eq(stayAgreements.id, residentCharges.agreementId),
        eq(stayAgreements.branchId, residentInvoiceCharges.branchId),
        eq(stayAgreements.stayId, residentInvoiceCharges.stayId),
      ),
    )
    .where(
      condition(
        scope,
        residentInvoiceCharges.branchId,
        residentInvoiceCharges.stayId,
        residentInvoiceCharges.invoiceId,
      ),
    );
}
