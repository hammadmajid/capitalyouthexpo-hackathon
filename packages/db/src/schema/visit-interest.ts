import { boolean, foreignKey, index, pgTable, unique, uuid } from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { branches } from './ownership.js';
import { visitRequests } from './visits.js';
// VISIT-001: append-only responses retain each explicit customer decision.
export const visitInterestResponses = pgTable(
  'visit_interest_responses',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    visitId: uuid('visit_id').notNull(),
    stillInterested: boolean('still_interested').notNull(),
    visitVersion: instant('visit_version').notNull(),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.visitId],
      foreignColumns: [visitRequests.branchId, visitRequests.id],
    }),
    index('visit_interest_response_page_idx').on(table.branchId, table.visitId, table.visitVersion),
    unique('visit_interest_response_version_uq').on(table.visitId, table.visitVersion),
  ],
);
