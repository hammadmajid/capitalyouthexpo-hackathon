import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { files } from './services.js';
import { branches } from './ownership.js';
import { bookings } from './bookings.js';
import { bookingDocumentKind, bookingDocumentState } from './inventory-enums.js';
import { identifier, instant } from './primitives.js';

// Private references only. Raw CNIC stays in the existing encrypted customer identity.
export const bookingDocuments = pgTable(
  'booking_documents',
  {
    id: identifier(),
    bookingId: uuid('booking_id'),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    kind: bookingDocumentKind('kind').notNull(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    state: bookingDocumentState('state').notNull(),
    reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id),
    reviewedAt: instant('reviewed_at'),
    rejectionCode: text('rejection_code'),
    consumedAt: instant('consumed_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('booking_documents_kind_uq').on(table.bookingId, table.kind),
    foreignKey({
      columns: [table.customerUserId, table.branchId, table.bookingId],
      foreignColumns: [bookings.customerUserId, bookings.branchId, bookings.id],
    }),
    check(
      'booking_documents_review_check',
      sql`
    (${table.state} = 'pending' and ${table.reviewedAt} is null and ${table.reviewedByUserId} is null)
    or (${table.state} <> 'pending' and ${table.reviewedAt} is not null and ${table.reviewedByUserId} is not null)`,
    ),
    check(
      'booking_documents_consumption_check',
      sql`${table.consumedAt} is null or (${table.bookingId} is null and ${table.state} <> 'rejected')`,
    ),
    check(
      'booking_documents_rejection_check',
      sql`
    (${table.state} = 'rejected') = (${table.rejectionCode} is not null)`,
    ),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('booking_documents_branch_idx').on(table.branchId),
    index('booking_documents_customer_idx').on(table.customerUserId),
    index('booking_documents_file_idx').on(table.fileId),
  ],
);
