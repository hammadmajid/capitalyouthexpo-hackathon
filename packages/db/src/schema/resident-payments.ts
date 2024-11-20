import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { stays } from './stays.js';
import { externalPaymentMethod } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

// PAY-008/009 / Q14: approved external hostel receipts, not proof-upload or bank-settlement claims.
// Pending proofs do not belong in this table. Receipt/ledger completeness is deferred to commit.
export const residentPayments = pgTable(
  'resident_payments',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    sourceKey: text('source_key').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    method: externalPaymentMethod('method').notNull(),
    transactionReference: text('transaction_reference'),
    proofFileId: uuid('proof_file_id').references(() => files.id),
    paidOn: date('paid_on').notNull(),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedAt: instant('approved_at').notNull().defaultNow(),
    note: text('note').notNull(),
  },
  (table) => [
    unique('resident_payments_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_payments_source_uq').on(table.stayId, table.sourceKey),
    unique('resident_payments_proof_uq').on(table.proofFileId),
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    check('resident_payments_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'resident_payments_source_check',
      sql`length(btrim(${table.sourceKey})) between 1 and 240`,
    ),
    check('resident_payments_note_check', sql`length(btrim(${table.note})) between 1 and 500`),
    check(
      'resident_payments_reference_check',
      sql`${table.transactionReference} is null or length(btrim(${table.transactionReference})) between 1 and 160`,
    ),
    index('resident_payments_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
export const residentReceipts = pgTable(
  'resident_receipts',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    number: text('number').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    issuedAt: instant('issued_at').notNull().defaultNow(),
  },
  (table) => [
    unique('resident_receipts_payment_uq').on(table.paymentId),
    unique('resident_receipts_number_uq').on(table.branchId, table.number),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    check('resident_receipts_number_check', sql`length(${table.number}) between 1 and 64`),
    check('resident_receipts_snapshot_check', sql`jsonb_typeof(${table.snapshot}) = 'object'`),
    index('resident_receipts_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
export const residentPaymentReversals = pgTable(
  'resident_payment_reversals',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    paymentId: uuid('payment_id').notNull(),
    reason: text('reason').notNull(),
    approvedByUserId: uuid('approved_by_user_id')
      .notNull()
      .references(() => users.id),
    approvedAt: instant('approved_at').notNull().defaultNow(),
  },
  (table) => [
    unique('resident_payment_reversals_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_payment_reversals_payment_uq').on(table.paymentId),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    check(
      'resident_payment_reversals_reason_check',
      sql`length(btrim(${table.reason})) between 1 and 500`,
    ),
  ],
);
