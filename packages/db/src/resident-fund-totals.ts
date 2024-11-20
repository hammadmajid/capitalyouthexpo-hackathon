import { and, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  residentLedger,
  residentPayments,
  residentReceipts,
  residentFundMovements,
} from './schema/index.js';
import type { PostingTransaction } from './resident-posting-context.js';
const original = alias(residentLedger, 'fund_original_entry');
function total(account: 'deposit' | 'advance', category: SQL, positiveSide: 'credit' | 'debit') {
  return sql<string>`coalesce(sum(case when ${residentLedger.account} = ${account} and ${category} then case when ${residentLedger.side} = ${positiveSide} then ${residentLedger.amountPaisa} else -${residentLedger.amountPaisa} end else 0 end),0)::text`;
}
function fundFields() {
  const received = sql`coalesce(${residentLedger.paymentId},${original.paymentId}) is not null`;
  return {
    depositReceived: total('deposit', received, 'credit'),
    depositApplied: total('deposit', sql`${residentFundMovements.kind} = 'deposit_apply'`, 'debit'),
    depositDeducted: total(
      'deposit',
      sql`${residentFundMovements.kind} = 'deposit_deduct'`,
      'debit',
    ),
    depositRefunded: total(
      'deposit',
      sql`${residentFundMovements.kind} = 'deposit_refund'`,
      'debit',
    ),
    advanceReceived: total('advance', received, 'credit'),
    advanceApplied: total('advance', sql`${residentFundMovements.kind} = 'advance_apply'`, 'debit'),
    advanceRefunded: total(
      'advance',
      sql`${residentFundMovements.kind} = 'advance_refund'`,
      'debit',
    ),
  };
}
function paymentJoin() {
  return and(
    eq(residentPayments.id, residentLedger.fundingPaymentId),
    eq(residentPayments.branchId, residentLedger.branchId),
    eq(residentPayments.stayId, residentLedger.stayId),
  );
}
function receiptJoin() {
  return and(
    eq(residentReceipts.paymentId, residentPayments.id),
    eq(residentReceipts.branchId, residentLedger.branchId),
    eq(residentReceipts.stayId, residentLedger.stayId),
  );
}
function originalJoin() {
  return and(
    eq(original.id, residentLedger.reversedEntryId),
    eq(original.branchId, residentLedger.branchId),
    eq(original.stayId, residentLedger.stayId),
    eq(original.fundingPaymentId, residentLedger.fundingPaymentId),
  );
}
function movementJoin() {
  return and(
    eq(
      residentFundMovements.id,
      sql`coalesce(${residentLedger.fundMovementId},${original.fundMovementId})`,
    ),
    eq(residentFundMovements.branchId, residentLedger.branchId),
    eq(residentFundMovements.stayId, residentLedger.stayId),
    eq(residentFundMovements.paymentId, residentLedger.fundingPaymentId),
  );
}
// RENT-005 / FIN-001: classify reversals by their original source, never as new receipts.
export function residentFundTotals(
  tx: PostingTransaction,
  scope: { branchId: string; stayId: string; paymentId?: string | undefined },
) {
  return fundQuery(tx, scope);
}
type Scope = { branchId: string } & (
  { stayId: string; paymentId?: string | undefined } | { stayIds: string[] }
);
function fundQuery(tx: PostingTransaction, scope: Scope) {
  return tx
    .select({
      ...fundFields(),
      stayId: 'stayIds' in scope ? residentLedger.stayId : sql<string>`${scope.stayId}`,
    })
    .from(residentLedger)
    .innerJoin(residentPayments, paymentJoin())
    .innerJoin(residentReceipts, receiptJoin())
    .leftJoin(original, originalJoin())
    .leftJoin(residentFundMovements, movementJoin())
    .where(
      and(
        eq(residentLedger.branchId, scope.branchId),
        'stayIds' in scope
          ? inArray(residentLedger.stayId, scope.stayIds)
          : eq(residentLedger.stayId, scope.stayId),
        inArray(residentLedger.account, ['deposit', 'advance']),
        !('paymentId' in scope) || scope.paymentId === undefined
          ? undefined
          : eq(residentLedger.fundingPaymentId, scope.paymentId),
      ),
    );
}
export function residentFundBatchTotals(
  tx: PostingTransaction,
  scope: { branchId: string; stayIds: string[] },
) {
  return fundQuery(tx, scope).groupBy(residentLedger.stayId);
}
