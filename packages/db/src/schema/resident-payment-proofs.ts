import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { users } from './identity.js';
import { files } from './services.js';
import { stays } from './stays.js';
import { residentInvoices } from './resident-invoices.js';
import { residentPayments } from './resident-payments.js';
import { bookingProofState } from './booking-upfront.js';
import { externalPaymentMethod } from './finance-enums.js';
import { identifier, instant } from './primitives.js';
// PAY-001..008 / ACC-004: a resident's evidence of a direct payment to the hostel for one
// invoice. Only staff review can verify it; approval links the one posted payment.
export const residentPaymentProofs = pgTable(
  'resident_payment_proofs',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    stayId: uuid('stay_id').notNull(),
    invoiceId: uuid('invoice_id'),
    submittedByUserId: uuid('submitted_by_user_id')
      .notNull()
      .references(() => users.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    depositPaisa: bigint('deposit_paisa', { mode: 'bigint' })
      .notNull()
      .default(sql`0`),
    method: externalPaymentMethod('method').notNull(),
    paidOn: date('paid_on').notNull(),
    reference: text('reference'),
    state: bookingProofState('state').notNull().default('submitted'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: instant('reviewed_at'),
    reviewReason: text('review_reason'),
    paymentId: uuid('payment_id'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    // One open proof per invoice; one proof per uploaded file; one proof per payment.
    uniqueIndex('resident_payment_proofs_open_uq')
      .on(table.invoiceId)
      .where(sql`${table.state} = 'submitted'`),
    uniqueIndex('resident_payment_proofs_pending_security_uq')
      .on(table.stayId)
      .where(sql`${table.state} = 'submitted' and ${table.depositPaisa} > 0`),
    check(
      'resident_payment_proofs_security_check',
      sql`${table.depositPaisa} between 0 and ${table.amountPaisa} and (${table.invoiceId} is not null or ${table.depositPaisa} > 0)`,
    ),
    uniqueIndex('resident_payment_proofs_file_uq').on(table.fileId),
    uniqueIndex('resident_payment_proofs_payment_uq')
      .on(table.paymentId)
      .where(sql`${table.paymentId} is not null`),
    index('resident_payment_proofs_queue_idx').on(table.branchId, table.state, table.id),
    index('resident_payment_proofs_stay_idx').on(table.branchId, table.stayId, table.id),
    check(
      'resident_payment_proofs_amount_check',
      sql`${table.amountPaisa} between 1 and 9007199254740991`,
    ),
    check(
      'resident_payment_proofs_review_check',
      sql`(${table.state} = 'submitted') = (${table.reviewedAt} is null)
        and (${table.reviewedAt} is null) = (${table.reviewedByUserId} is null)
        and (${table.state} = 'approved') = (${table.paymentId} is not null)
        and (${table.state} <> 'rejected' or length(btrim(coalesce(${table.reviewReason}, ''))) between 1 and 500)
        and (${table.reference} is null or length(btrim(${table.reference})) between 1 and 120)`,
    ),
  ],
);
// PAY-002 / CHG-050: the other bills of the same Stay that one proof also pays (for example
// rent and transport in one transfer). The proof's own invoice_id stays its main bill; on
// approval one payment is split across all of them, oldest due first.
export const residentPaymentProofInvoices = pgTable(
  'resident_payment_proof_invoices',
  {
    proofId: uuid('proof_id')
      .notNull()
      .references(() => residentPaymentProofs.id),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.proofId, table.invoiceId] }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    index('resident_payment_proof_invoices_invoice_idx').on(table.invoiceId),
  ],
);
