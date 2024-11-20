import { sql } from 'drizzle-orm';
import {
  boolean,
  bigint,
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
import { branches } from './ownership.js';
import { floors } from './property-structure.js';
import { identifier, instant, timestamps } from './primitives.js';
import { inventoryMode, inventoryStatus } from './inventory-enums.js';

export const roomTypes = pgTable(
  'room_types',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    inventoryMode: inventoryMode('inventory_mode').notNull(),
    capacity: integer('capacity').notNull(),
    setupManaged: boolean('setup_managed').notNull().default(false),
    bedMonthlyRentPaisa: bigint('bed_monthly_rent_paisa', { mode: 'bigint' }),
    roomMonthlyRentPaisa: bigint('room_monthly_rent_paisa', { mode: 'bigint' }),
    depositPaisa: bigint('deposit_paisa', { mode: 'bigint' }).notNull(),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    unique('room_types_branch_id_uq').on(table.branchId, table.id),
    check('room_types_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check(
      'room_types_capacity_check',
      sql`${table.capacity} between 0 and 2147483646 and (${table.setupManaged} or ${table.capacity} >= 1)`,
    ),
    check(
      'room_types_prices_check',
      sql`
    ${table.depositPaisa} >= 0
    and (${table.bedMonthlyRentPaisa} is null or ${table.bedMonthlyRentPaisa} >= 0)
    and (${table.roomMonthlyRentPaisa} is null or ${table.roomMonthlyRentPaisa} >= 0)
    and (${table.inventoryMode} = 'whole_room' or ${table.bedMonthlyRentPaisa} is not null or ${table.setupManaged})
    and (not ${table.setupManaged} or ${table.inventoryMode} = 'per_bed')
    and (${table.inventoryMode} = 'per_bed' or ${table.roomMonthlyRentPaisa} is not null)`,
    ),
    index('room_types_branch_idx').on(table.branchId),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id').notNull(),
    // Legacy rooms retain unknown location until management explicitly links a floor.
    floorId: uuid('floor_id'),
    locationVersion: integer('location_version').notNull().default(1),
    label: text('label').notNull(),
    status: inventoryStatus('status').notNull(),
    // ROOM-AMN (SRS v2.15): false inherits room-type amenities; true uses room_amenities.
    amenitiesCustomized: boolean('amenities_customized').notNull().default(false),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('rooms_branch_id_uq').on(table.branchId, table.id),
    check('rooms_location_version_check', sql`${table.locationVersion} > 0`),
    foreignKey({
      columns: [table.branchId, table.floorId],
      foreignColumns: [floors.branchId, floors.id],
    }),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    unique('rooms_branch_type_id_uq').on(table.branchId, table.roomTypeId, table.id),
    uniqueIndex('rooms_live_label_uq')
      .on(table.branchId, table.label)
      .where(sql`${table.archivedAt} is null`),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    check('rooms_label_check', sql`length(btrim(${table.label})) between 1 and 80`),
    index('rooms_type_idx').on(table.roomTypeId),
  ],
);

// Physical beds retain the SRS Seat identity. Ordinals never change or recycle.
export const seats = pgTable(
  'seats',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    ordinal: integer('ordinal').notNull(),
    label: text('label').notNull(),
    status: inventoryStatus('status').notNull(),
    ...timestamps(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('seats_room_ordinal_uq').on(table.roomId, table.ordinal),
    unique('seats_branch_room_id_ordinal_uq').on(
      table.branchId,
      table.roomId,
      table.id,
      table.ordinal,
    ),
    unique('seats_branch_room_id_uq').on(table.branchId, table.roomId, table.id),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    check('seats_ordinal_check', sql`${table.ordinal} between 1 and 2147483646`),
    check('seats_label_check', sql`length(btrim(${table.label})) between 1 and 80`),
    index('seats_branch_idx').on(table.branchId),
  ],
);
