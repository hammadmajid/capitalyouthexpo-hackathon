import { sql } from 'drizzle-orm';
import { check, foreignKey, index, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { stays } from './stays.js';
import { identifier, instant } from './primitives.js';

// RES-001 / ACC-004: contact matching never grants phone-based access without staff approval.
export const residentAccountLinks = pgTable(
  'resident_account_links',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    matchedPhone: text('matched_phone').notNull(),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected' | 'expired'>()
      .notNull()
      .default('pending'),
    createdAt: instant('created_at').notNull(),
    decidedAt: instant('decided_at'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
  },
  (t) => [
    foreignKey({ columns: [t.branchId, t.stayId], foreignColumns: [stays.branchId, stays.id] }),
    unique('resident_account_links_stay_user_uq').on(t.stayId, t.userId),
    index('resident_account_links_queue_idx').on(t.branchId, t.status, t.id),
    check(
      'resident_account_links_status_check',
      sql`${t.status} in ('pending','approved','rejected','expired')`,
    ),
    check(
      'resident_account_links_decision_check',
      sql`(${t.status} = 'pending' and ${t.decidedAt} is null and ${t.decidedByUserId} is null) or (${t.status} <> 'pending' and ${t.decidedAt} is not null)`,
    ),
  ],
);
