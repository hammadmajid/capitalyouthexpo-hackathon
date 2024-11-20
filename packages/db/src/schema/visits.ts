import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { identifier, instant, timestamps } from './primitives.js';
import type { VisitTiming } from '@hsm/contracts';
// VISIT-001: persisted weekly windows; scope is locked before replacement/request actions.
export const visitingHours = pgTable(
  'visiting_hours',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    dayOfWeek: smallint('day_of_week').notNull(),
    opensAt: time('opens_at').notNull(),
    closesAt: time('closes_at').notNull(),
  },
  (table) => [
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    check('visiting_hours_weekday_check', sql`${table.dayOfWeek} between 0 and 6`),
    check('visiting_hours_order_check', sql`${table.opensAt} < ${table.closesAt}`),
    unique('visiting_hours_window_uq').on(
      table.branchId,
      table.dayOfWeek,
      table.opensAt,
      table.closesAt,
    ),
  ],
);
export const visitRequests = pgTable(
  'visit_requests',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    requestedStart: instant('requested_start').notNull(),
    proposedStart: instant('proposed_start'),
    status: text('status').$type<VisitTiming['status']>().notNull(),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    reason: text('reason'),
    followUpSentAt: instant('follow_up_sent_at'),
    ...timestamps(),
  },
  (table) => [
    unique('visit_requests_branch_id_uq').on(table.branchId, table.id),
    check(
      'visit_requests_status_check',
      sql`${table.status} in ('requested','approved','rescheduled','rejected','cancelled','completed','no_show')`,
    ),
    check(
      'visit_requests_proposal_check',
      sql`(${table.status} = 'rescheduled') = (${table.proposedStart} is not null)`,
    ),
    check(
      'visit_requests_reason_check',
      sql`${table.reason} is null or length(btrim(${table.reason})) between 1 and 500`,
    ),
    check(
      'visit_requests_rejection_check',
      sql`${table.status} <> 'rejected' or ${table.reason} is not null`,
    ),
    check(
      'visit_requests_follow_up_check',
      sql`${table.followUpSentAt} is null or ${table.status} = 'completed'`,
    ),
    uniqueIndex('visit_requests_active_time_uq')
      .on(table.customerUserId, table.branchId, table.requestedStart)
      .where(sql`${table.status} in ('requested','approved','rescheduled')`),
    index('visit_requests_follow_up_idx')
      .on(table.id)
      .where(sql`${table.status} = 'completed' and ${table.followUpSentAt} is null`),
    index('visit_requests_customer_page_idx').on(table.customerUserId, table.id),
    index('visit_requests_branch_schedule_idx').on(table.branchId, table.requestedStart, table.id),
    index('visit_requests_decider_idx').on(table.decidedByUserId),
  ],
);
// Append-only snapshots preserve original requested times through accepted reschedules.
export const visitHistory = pgTable(
  'visit_history',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    visitId: uuid('visit_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    action: text('action').notNull(),
    status: text('status').$type<VisitTiming['status']>().notNull(),
    requestedStart: instant('requested_start').notNull(),
    proposedStart: instant('proposed_start'),
    reason: text('reason'),
    createdAt: instant('created_at').defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.visitId],
      foreignColumns: [visitRequests.branchId, visitRequests.id],
    }),
    check(
      'visit_history_action_check',
      sql`${table.action} in ('request','approve','reschedule','reject','cancel','accept-reschedule','complete','no-show')`,
    ),
    check(
      'visit_history_status_check',
      sql`${table.status} in ('requested','approved','rescheduled','rejected','cancelled','completed','no_show')`,
    ),
    check(
      'visit_history_proposal_check',
      sql`(${table.status} = 'rescheduled') = (${table.proposedStart} is not null)`,
    ),
    check(
      'visit_history_reason_check',
      sql`${table.reason} is null or length(btrim(${table.reason})) between 1 and 500`,
    ),
    index('visit_history_visit_idx').on(table.branchId, table.visitId, table.id),
    index('visit_history_actor_idx').on(table.actorUserId),
  ],
);
