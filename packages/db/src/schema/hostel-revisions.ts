import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { brands, branches } from './ownership.js';
import { identifier, instant } from './primitives.js';
// CHG-041 / SRS v2.29: an approved hostel stays live while the Owner's edits to its basics
// and location wait here for Admin re-verification. Approval copies them onto the live rows.
export const hostelRevisionStatus = pgEnum('hostel_revision_status_enum', [
  'draft',
  'submitted',
  'approved',
  'rejected',
  'cancelled',
]);
export const hostelRevisions = pgTable(
  'hostel_revisions',
  {
    id: identifier(),
    brandId: uuid('brand_id')
      .notNull()
      .references(() => brands.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    status: hostelRevisionStatus('status').notNull().default('draft'),
    changes: jsonb('changes').$type<Record<string, unknown>>().notNull(),
    version: integer('version').notNull().default(1),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    submittedAt: instant('submitted_at'),
    decidedAt: instant('decided_at'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    decisionNote: text('decision_note'),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    // One open revision per hostel branch.
    uniqueIndex('hostel_revisions_open_uq')
      .on(table.branchId)
      .where(sql`${table.status} in ('draft', 'submitted')`),
    index('hostel_revisions_status_idx').on(table.status, table.submittedAt),
    index('hostel_revisions_brand_idx').on(table.brandId),
    index('hostel_revisions_branch_idx').on(table.branchId),
    index('hostel_revisions_created_by_idx').on(table.createdByUserId),
    index('hostel_revisions_decided_by_idx').on(table.decidedByUserId),
    check('hostel_revisions_changes_check', sql`jsonb_typeof(${table.changes}) = 'object'`),
    check('hostel_revisions_version_check', sql`${table.version} > 0`),
    check(
      'hostel_revisions_decision_check',
      sql`(${table.status} in ('approved', 'rejected')) = (${table.decidedAt} is not null and ${table.decidedByUserId} is not null)`,
    ),
    check(
      'hostel_revisions_submitted_check',
      sql`${table.status} = 'draft' or ${table.status} = 'cancelled' or ${table.submittedAt} is not null`,
    ),
  ],
);
