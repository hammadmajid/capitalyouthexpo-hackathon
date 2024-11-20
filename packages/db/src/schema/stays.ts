import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { users } from './identity.js';
import { bookings } from './bookings.js';
import { residents } from './residents.js';
import { staySource, stayState } from './stay-enums.js';
import { identifier, instant, timestamps } from './primitives.js';

// STAY-001/003: a confirmed reservation alone never creates actual residency.
export const stays = pgTable(
  'stays',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    residentId: uuid('resident_id').notNull(),
    userId: uuid('user_id').references(() => users.id),
    bookingId: uuid('booking_id'),
    source: staySource('source').notNull(),
    state: stayState('state').notNull(),
    version: integer('version').notNull().default(1),
    moveInDate: date('move_in_date').notNull(),
    expectedLeaveDate: date('expected_leave_date'),
    checkedInAt: instant('checked_in_at'),
    closedAt: instant('closed_at'),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    ...timestamps(),
  },
  (table) => [
    unique('stays_branch_id_uq').on(table.branchId, table.id),
    unique('stays_booking_uq').on(table.bookingId),
    foreignKey({
      columns: [table.branchId, table.residentId],
      foreignColumns: [residents.branchId, residents.id],
    }),
    foreignKey({
      columns: [table.branchId, table.residentId, table.userId],
      foreignColumns: [residents.branchId, residents.id, residents.userId],
    }),
    foreignKey({
      columns: [table.userId, table.branchId, table.bookingId],
      foreignColumns: [bookings.customerUserId, bookings.branchId, bookings.id],
    }),
    check(
      'stays_source_check',
      sql`(${table.source} = 'booking' and ${table.bookingId} is not null and ${table.userId} is not null) or (${table.source} = 'manual' and ${table.bookingId} is null)`,
    ),
    check('stays_version_check', sql`${table.version} > 0`),
    check(
      'stays_dates_check',
      sql`${table.expectedLeaveDate} is null or ${table.moveInDate} < ${table.expectedLeaveDate}`,
    ),
    check(
      'stays_checkin_check',
      sql`${table.state} in ('check_in_ready', 'cancelled_before_checkin') or ${table.checkedInAt} is not null`,
    ),
    check(
      'stays_closed_check',
      sql`(${table.state} in ('completed','terminated','abandoned') and ${table.closedAt} is not null and ${table.closedAt} >= ${table.checkedInAt}) or (${table.state} not in ('completed','terminated','abandoned') and ${table.closedAt} is null)`,
    ),
    uniqueIndex('stays_active_user_uq')
      .on(table.userId)
      .where(
        sql`${table.state} in ('active','notice_given','checkout_pending') and ${table.userId} is not null`,
      ),
    uniqueIndex('stays_active_resident_uq')
      .on(table.residentId)
      .where(sql`${table.state} in ('active','notice_given','checkout_pending')`),
    index('stays_branch_state_page_idx').on(table.branchId, table.state, table.id),
    index('stays_resident_page_idx').on(table.branchId, table.residentId, table.id),
    index('stays_user_page_idx').on(table.userId, table.id),
  ],
);

// Append-only domain events; mandatory audit/outbox are written in the same command transaction.
export const stayHistory = pgTable(
  'stay_history',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    previousState: stayState('previous_state'),
    nextState: stayState('next_state').notNull(),
    reasonCode: text('reason_code').notNull(),
    detail: jsonb('detail').$type<Record<string, unknown>>().notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    check('stay_history_detail_check', sql`jsonb_typeof(${table.detail}) = 'object'`),
    check('stay_history_reason_check', sql`length(btrim(${table.reasonCode})) between 1 and 80`),
    index('stay_history_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
