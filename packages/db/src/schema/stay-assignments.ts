import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { roomTypes, rooms, seats } from './inventory.js';
import { stays } from './stays.js';
import { identifier, instant } from './primitives.js';

// RES-004/005: actual occupancy history, not a second public availability projection.
// Active assignments must receive a stay-sourced inventory claim in their admission transaction.
export const stayAssignments = pgTable(
  'stay_assignments',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    roomTypeId: uuid('room_type_id').notNull(),
    roomId: uuid('room_id').notNull(),
    seatId: uuid('seat_id'),
    seatOrdinal: integer('seat_ordinal'),
    startedAt: instant('started_at').notNull(),
    endedAt: instant('ended_at'),
    reason: text('reason').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    unique('stay_assignments_scope_uq').on(table.branchId, table.roomId, table.id),
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomTypeId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.roomTypeId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId, table.seatOrdinal],
      foreignColumns: [seats.branchId, seats.roomId, seats.id, seats.ordinal],
    }),
    check(
      'stay_assignments_seat_pair_check',
      sql`(${table.seatId} is null) = (${table.seatOrdinal} is null)`,
    ),
    check(
      'stay_assignments_period_check',
      sql`${table.endedAt} is null or ${table.startedAt} < ${table.endedAt}`,
    ),
    check('stay_assignments_reason_check', sql`length(btrim(${table.reason})) between 1 and 500`),
    uniqueIndex('stay_assignments_current_uq')
      .on(table.stayId)
      .where(sql`${table.endedAt} is null`),
    index('stay_assignments_history_idx').on(table.branchId, table.stayId, table.id),
    index('stay_assignments_room_idx').on(table.branchId, table.roomId, table.id),
  ],
);
