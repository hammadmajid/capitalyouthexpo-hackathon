import { sql } from 'drizzle-orm';
import { check, foreignKey, jsonb, pgTable, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { stays } from './stays.js';
import { identifier, instant } from './primitives.js';
// OUT-005: the settlement statement frozen at the checkout commit. One per Stay; later
// fund movements (deductions, refunds) are recorded separately and never rewrite it.
export const stayFinalStatements = pgTable(
  'stay_final_statements',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    uniqueIndex('stay_final_statements_stay_uq').on(table.stayId),
    check('stay_final_statements_snapshot_check', sql`jsonb_typeof(${table.snapshot}) = 'object'`),
  ],
);
