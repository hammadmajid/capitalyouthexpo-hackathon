import { sql } from 'drizzle-orm';
import { check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { identifier, instant, timestamps } from './primitives.js';
// Informational listing text; never overrides enforced booking/KYC/financial policy.
export const hostelRules = pgTable(
  'hostel_rules',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    body: text('body').notNull(),
    sortOrder: integer('sort_order').notNull(),
    revision: integer('revision').notNull().default(1),
    archivedAt: instant('archived_at'),
    ...timestamps(),
  },
  (table) => [
    index('hostel_rules_branch_order_idx').on(table.branchId, table.sortOrder, table.id),
    index('hostel_rules_active_order_idx')
      .on(table.branchId, table.sortOrder, table.id)
      .where(sql`${table.archivedAt} is null`),
    check(
      'hostel_rules_body_check',
      sql`length(${table.body}) between 1 and 4000 and ${table.body} !~ '^[[:space:]]*$'`,
    ),
    check('hostel_rules_order_check', sql`${table.sortOrder} >= 0`),
    check('hostel_rules_revision_check', sql`${table.revision} > 0`),
  ],
);
