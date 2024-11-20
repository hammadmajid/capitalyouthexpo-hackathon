import { sql } from 'drizzle-orm';
import {
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { users } from './identity.js';
import { rooms, seats } from './inventory.js';
import { bookingHolds, bookings } from './bookings.js';
import { identifier, instant } from './primitives.js';
import { stayAssignments } from './stay-assignments.js';

const stayRange = customType<{ data: string }>({ dataType: () => 'daterange' });
const slotRange = customType<{ data: string }>({ dataType: () => 'int4range' });

export const inventoryBlocks = pgTable(
  'inventory_blocks',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    seatId: uuid('seat_id'),
    moveInDate: date('move_in_date').notNull(),
    moveOutDate: date('move_out_date').notNull(),
    reason: integer('reason').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    releasedAt: instant('released_at'),
  },
  (table) => [
    unique('inventory_blocks_scope_uq').on(table.branchId, table.roomId, table.id),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId],
      foreignColumns: [seats.branchId, seats.roomId, seats.id],
    }),
    check('inventory_blocks_range_check', sql`${table.moveInDate} < ${table.moveOutDate}`),
    // 1=manual unavailable, 2=scheduled maintenance; no arbitrary customer-visible reason.
    check('inventory_blocks_reason_check', sql`${table.reason} in (1, 2)`),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('inventory_blocks_branch_idx').on(table.branchId),
  ],
);

// Generated ranges cannot be forged. NULL seat means every physical slot in the room.
// Migration 0009 adds the GiST exclusion constraint missing from Drizzle's builder.
export const inventoryClaims = pgTable(
  'inventory_claims',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    seatId: uuid('seat_id'),
    seatOrdinal: integer('seat_ordinal'),
    holdId: uuid('hold_id'),
    bookingId: uuid('booking_id'),
    blockId: uuid('block_id'),
    assignmentId: uuid('assignment_id'),
    moveInDate: date('move_in_date').notNull(),
    moveOutDate: date('move_out_date'),
    stayRange: stayRange('stay_range').generatedAlwaysAs(
      sql`daterange(move_in_date, move_out_date, '[)')`,
    ),
    slotRange: slotRange('slot_range').generatedAlwaysAs(sql`
    CASE WHEN seat_ordinal IS NULL THEN int4range(NULL, NULL, '[)')
    ELSE int4range(seat_ordinal, seat_ordinal + 1, '[)') END`),
    expiresAt: instant('expires_at'),
    releasedAt: instant('released_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId, table.seatOrdinal],
      foreignColumns: [seats.branchId, seats.roomId, seats.id, seats.ordinal],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.holdId],
      foreignColumns: [bookingHolds.branchId, bookingHolds.roomId, bookingHolds.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.bookingId],
      foreignColumns: [bookings.branchId, bookings.roomId, bookings.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.blockId],
      foreignColumns: [inventoryBlocks.branchId, inventoryBlocks.roomId, inventoryBlocks.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.assignmentId],
      foreignColumns: [stayAssignments.branchId, stayAssignments.roomId, stayAssignments.id],
    }),
    check(
      'inventory_claims_source_check',
      sql`num_nonnulls(${table.holdId}, ${table.bookingId}, ${table.blockId}, ${table.assignmentId}) = 1`,
    ),
    check(
      'inventory_claims_seat_pair_check',
      sql`(${table.seatId} is null) = (${table.seatOrdinal} is null)`,
    ),
    check(
      'inventory_claims_range_check',
      sql`CASE WHEN ${table.moveOutDate} is null THEN ${table.assignmentId} is not null ELSE ${table.moveInDate} < ${table.moveOutDate} END`,
    ),
    check(
      'inventory_claims_expiry_check',
      sql`${table.holdId} is null or ${table.expiresAt} is not null`,
    ),
    index('inventory_claims_room_idx').on(table.roomId),
    index('inventory_claims_expiry_idx')
      .on(table.expiresAt)
      .where(sql`${table.releasedAt} is null`),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('inventory_claims_booking_idx').on(table.bookingId),
    index('inventory_claims_hold_idx').on(table.holdId),
    index('inventory_claims_assignment_idx').on(table.assignmentId),
    uniqueIndex('inventory_claims_live_assignment_uq')
      .on(table.assignmentId)
      .where(sql`${table.assignmentId} is not null and ${table.releasedAt} is null`),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    index('inventory_claims_block_idx').on(table.blockId),
  ],
);
