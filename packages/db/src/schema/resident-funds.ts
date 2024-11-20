import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { residentPayments } from './resident-payments.js';
import { residentInvoices } from './resident-invoices.js';
import { residentFundMovementKind } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

// OUT-004/005 / RENT-005: movements retain original approved-payment provenance.
// Refund rows record an external hostel settlement, never a platform money transfer.
export const residentFundMovements = pgTable(
  'resident_fund_movements',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    invoiceId: uuid('invoice_id'),
    kind: residentFundMovementKind('kind').notNull(),
    sourceKey: text('source_key').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    reason: text('reason').notNull(),
    externalReference: text('external_reference'),
    postedByUserId: uuid('posted_by_user_id')
      .notNull()
      .references(() => users.id),
    postedAt: instant('posted_at').notNull().defaultNow(),
  },
  (table) => [
    unique('resident_fund_movements_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_fund_movements_source_uq').on(table.stayId, table.sourceKey),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    check(
      'resident_fund_movements_invoice_check',
      sql`(${table.kind} in ('deposit_apply','advance_apply')) = (${table.invoiceId} is not null)`,
    ),
    check('resident_fund_movements_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'resident_fund_movements_reason_check',
      sql`length(btrim(${table.reason})) between 1 and 500`,
    ),
    check(
      'resident_fund_movements_source_check',
      sql`length(btrim(${table.sourceKey})) between 1 and 240`,
    ),
    check(
      'resident_fund_movements_reference_check',
      sql`${table.externalReference} is null or length(btrim(${table.externalReference})) between 1 and 160`,
    ),
    index('resident_fund_movements_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
