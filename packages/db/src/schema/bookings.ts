import { sql } from 'drizzle-orm';
import {
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
import { branches } from './ownership.js';
import { rooms, seats } from './inventory.js';
import { bookingPolicies } from './booking-policies.js';
import { bookingState } from './inventory-enums.js';
import { identifier, instant, timestamps } from './primitives.js';

export const bookingHolds = pgTable(
  'booking_holds',
  {
    id: identifier(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    seatId: uuid('seat_id'),
    moveInDate: date('move_in_date').notNull(),
    moveOutDate: date('move_out_date').notNull(),
    expiresAt: instant('expires_at').notNull(),
    releasedAt: instant('released_at'),
    quoteSnapshot: jsonb('quote_snapshot').$type<Record<string, unknown>>().notNull(),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => bookingPolicies.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('booking_holds_scope_uq').on(table.branchId, table.roomId, table.id),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    unique('booking_holds_customer_branch_id_uq').on(
      table.customerUserId,
      table.branchId,
      table.id,
    ),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId],
      foreignColumns: [seats.branchId, seats.roomId, seats.id],
    }),
    check('booking_holds_range_check', sql`${table.moveInDate} < ${table.moveOutDate}`),
    check('booking_holds_expiry_check', sql`${table.expiresAt} > ${table.createdAt}`),
    check('booking_holds_snapshot_check', sql`jsonb_typeof(${table.quoteSnapshot}) = 'object'`),
    index('booking_holds_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.releasedAt} is null`),
    index('booking_holds_customer_idx').on(table.customerUserId),
  ],
);

export const bookings = pgTable(
  'bookings',
  {
    id: identifier(),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    seatId: uuid('seat_id'),
    holdId: uuid('hold_id'),
    moveInDate: date('move_in_date').notNull(),
    moveOutDate: date('move_out_date').notNull(),
    state: bookingState('state').notNull(),
    requestExpiresAt: instant('request_expires_at'),
    quoteSnapshot: jsonb('quote_snapshot').$type<Record<string, unknown>>().notNull(),
    policyVersionId: uuid('policy_version_id')
      .notNull()
      .references(() => bookingPolicies.id),
    ...timestamps(),
  },
  (table) => [
    unique('bookings_hold_uq').on(table.holdId),
    unique('bookings_scope_uq').on(table.branchId, table.roomId, table.id),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    unique('bookings_customer_branch_id_uq').on(table.customerUserId, table.branchId, table.id),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId],
      foreignColumns: [seats.branchId, seats.roomId, seats.id],
    }),
    foreignKey({
      columns: [table.customerUserId, table.branchId, table.holdId],
      foreignColumns: [bookingHolds.customerUserId, bookingHolds.branchId, bookingHolds.id],
    }),
    check('bookings_range_check', sql`${table.moveInDate} < ${table.moveOutDate}`),
    check(
      // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
      'bookings_request_expiry_check',
      sql`
    (${table.state} <> 'pending_request' or ${table.requestExpiresAt} is not null)
    and (${table.requestExpiresAt} is null or ${table.requestExpiresAt} > ${table.createdAt})`,
    ),
    check('bookings_snapshot_check', sql`jsonb_typeof(${table.quoteSnapshot}) = 'object'`),
    index('bookings_customer_state_idx').on(table.customerUserId, table.state),
    index('bookings_branch_state_idx').on(table.branchId, table.state),
    index('bookings_expiry_idx')
      .on(table.requestExpiresAt)
      .where(sql`${table.state} = 'pending_request'`),
  ],
);

export const bookingHistory = pgTable(
  'booking_history',
  {
    id: identifier(),
    bookingId: uuid('booking_id')
      .notNull()
      .references(() => bookings.id),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    previousState: bookingState('previous_state'),
    nextState: bookingState('next_state').notNull(),
    reasonCode: text('reason_code').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [index('booking_history_booking_idx').on(table.bookingId, table.createdAt)],
);
