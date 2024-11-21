import { and, eq, exists, isNotNull, sql, type SQL } from 'drizzle-orm';
import { QueryBuilder } from 'drizzle-orm/pg-core';
import {
  complaints,
  residentInvoices,
  residentLedger,
  residentPayments,
  residentReceipts,
  residents,
  stayFinalStatements,
  stays,
  transportSubscriptions,
} from '@hsm/db';
import { DomainError, type ReportType } from '@hsm/contracts';
const queries = new QueryBuilder();
const one = { one: sql`1` };
function paymentFact() {
  return exists(
    queries
      .select(one)
      .from(residentPayments)
      .innerJoin(
        residentReceipts,
        and(
          eq(residentReceipts.branchId, residentPayments.branchId),
          eq(residentReceipts.stayId, residentPayments.stayId),
          eq(residentReceipts.paymentId, residentPayments.id),
        ),
      )
      .where(
        and(eq(residentPayments.branchId, stays.branchId), eq(residentPayments.stayId, stays.id)),
      ),
  );
}
function depositFact() {
  // FIN-001: a selector offers identities with an approved deposit receipt fact;
  // it does not calculate or assert their current canonical balance/eligibility.
  return exists(
    queries
      .select(one)
      .from(residentLedger)
      .innerJoin(
        residentReceipts,
        and(
          eq(residentReceipts.branchId, residentLedger.branchId),
          eq(residentReceipts.stayId, residentLedger.stayId),
          eq(residentReceipts.paymentId, residentLedger.fundingPaymentId),
        ),
      )
      .where(
        and(
          eq(residentLedger.branchId, stays.branchId),
          eq(residentLedger.stayId, stays.id),
          eq(residentLedger.account, 'deposit'),
          eq(residentLedger.side, 'credit'),
          isNotNull(residentLedger.paymentId),
        ),
      ),
  );
}
function reportFact(kind: ReportType): SQL | undefined {
  switch (kind) {
    case 'residents':
      return undefined;
    case 'rent-collection':
    case 'outstanding-dues':
      return exists(
        queries
          .select(one)
          .from(residentInvoices)
          .where(
            and(
              eq(residentInvoices.branchId, stays.branchId),
              eq(residentInvoices.stayId, stays.id),
            ),
          ),
      );
    case 'payment-history':
      return paymentFact();
    case 'security-deposits':
      return depositFact();
    case 'checkout-history':
      return exists(
        queries
          .select(one)
          .from(stayFinalStatements)
          .where(
            and(
              eq(stayFinalStatements.branchId, stays.branchId),
              eq(stayFinalStatements.stayId, stays.id),
            ),
          ),
      );
    case 'complaints':
      return exists(
        queries
          .select(one)
          .from(complaints)
          .where(and(eq(complaints.branchId, stays.branchId), eq(complaints.stayId, stays.id))),
      );
    case 'transport-subscribers':
      return exists(
        queries
          .select(one)
          .from(transportSubscriptions)
          .where(
            and(
              eq(transportSubscriptions.branchId, stays.branchId),
              eq(transportSubscriptions.stayId, stays.id),
            ),
          ),
      );
    default:
      throw new DomainError('VALIDATION_FAILED', 400, 'Resident filter is not applicable');
  }
}
// SEC-003: finance-only authority never receives the broader resident directory,
// linked-account flags, contact information, or names with no permitted report fact.
export function reportResidentOptionPredicate(kind: ReportType) {
  return exists(
    queries
      .select(one)
      .from(stays)
      .where(
        and(
          eq(stays.branchId, residents.branchId),
          eq(stays.residentId, residents.id),
          reportFact(kind),
        ),
      ),
  );
}
