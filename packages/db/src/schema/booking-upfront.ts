import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { upfront } from './enums.js';
import { bookings } from './bookings.js';
import { files } from './services.js';
import { externalPaymentMethod } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

export const bookingProofState = pgEnum('booking_proof_state_enum', [
  'submitted',
  'approved',
  'rejected',
]);

// BKG-004 / BKG-005: the upfront requirement and amount are captured once from the request quote.
export const bookingUpfrontTerms = pgTable(
  'booking_upfront_terms',
  {
    bookingId: uuid('booking_id')
      .primaryKey()
      .references(() => bookings.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    requirement: upfront('requirement').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    approvedAt: instant('approved_at'),
    approvedByUserId: uuid('approved_by_user_id').references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.customerUserId, table.branchId, table.bookingId],
      foreignColumns: [bookings.customerUserId, bookings.branchId, bookings.id],
    }),
    check(
      'booking_upfront_terms_amount_check',
      sql`${table.amountPaisa} between 1 and 9007199254740991`,
    ),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('booking_upfront_terms_branch_idx').on(table.branchId),
  ],
);

// BKG-007: Owner-configured direct-to-hostel payment instructions; the platform holds no money.
export const branchPaymentInstructions = pgTable(
  'branch_payment_instructions',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    method: externalPaymentMethod('method').notNull(),
    accountTitle: text('account_title').notNull(),
    accountIdentifier: text('account_identifier').notNull(),
    instructions: text('instructions'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    index('branch_payment_instructions_branch_idx')
      .on(table.branchId, table.createdAt)
      .where(sql`${table.archivedAt} is null`),
    check(
      'branch_payment_instructions_text_check',
      sql`length(btrim(${table.accountTitle})) between 1 and 120
        and length(btrim(${table.accountIdentifier})) between 1 and 80
        and (${table.instructions} is null or length(btrim(${table.instructions})) between 1 and 500)`,
    ),
  ],
);

// BKG-008 / ACC-004: customer evidence of a direct payment; only review can verify it.
export const bookingPaymentProofs = pgTable(
  'booking_payment_proofs',
  {
    id: identifier(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookingUpfrontTerms.bookingId),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    method: externalPaymentMethod('method').notNull(),
    paidOn: date('paid_on').notNull(),
    reference: text('reference'),
    state: bookingProofState('state').notNull().default('submitted'),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: instant('reviewed_at'),
    reviewReason: text('review_reason'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('booking_payment_proofs_open_uq')
      .on(table.bookingId)
      .where(sql`${table.state} <> 'rejected'`),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    uniqueIndex('booking_payment_proofs_file_uq').on(table.fileId),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('booking_payment_proofs_branch_state_idx').on(table.branchId, table.state),
    check(
      // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
      'booking_payment_proofs_amount_check',
      sql`${table.amountPaisa} between 1 and 9007199254740991`,
    ),
    check(
      // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
      'booking_payment_proofs_review_check',
      sql`(${table.state} = 'submitted') = (${table.reviewedAt} is null)
        and (${table.reviewedAt} is null) = (${table.reviewedByUserId} is null)
        and (${table.state} <> 'rejected' or length(btrim(coalesce(${table.reviewReason}, ''))) between 1 and 500)
        and (${table.reference} is null or length(btrim(${table.reference})) between 1 and 120)`,
    ),
  ],
);
