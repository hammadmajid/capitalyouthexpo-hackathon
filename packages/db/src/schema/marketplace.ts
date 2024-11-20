import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches, organizations } from './ownership.js';
import { roomTypes, rooms, seats } from './inventory.js';
import { files } from './services.js';
import { identifier, instant } from './primitives.js';

export const amenities = pgTable(
  'amenities',
  {
    code: text('code').primaryKey(),
    name: text('name').notNull(),
    organizationId: uuid('organization_id').references(() => organizations.id),
    category: text('category').notNull().default('other'),
    isActive: boolean('is_active').notNull(),
  },
  (table) => [
    check('amenities_code_check', sql`${table.code} ~ '^[a-z][a-z0-9_]{1,47}$'`),
    uniqueIndex('amenities_organization_name_uq')
      .on(table.organizationId, sql`lower(btrim(${table.name}))`)
      .where(sql`${table.organizationId} is not null`),
    check(
      'amenities_category_check',
      sql`${table.category} in ('connectivity', 'facilities', 'security', 'services', 'other')`,
    ),
    check('amenities_name_check', sql`length(btrim(${table.name})) between 1 and 80`),
  ],
);
export const branchAmenities = pgTable(
  'branch_amenities',
  {
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    amenityCode: text('amenity_code')
      .notNull()
      .references(() => amenities.code),
  },
  (table) => [primaryKey({ columns: [table.branchId, table.amenityCode] })],
);
export const roomTypeAmenities = pgTable(
  'room_type_amenities',
  {
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id').notNull(),
    amenityCode: text('amenity_code')
      .notNull()
      .references(() => amenities.code),
  },
  (table) => [
    primaryKey({ columns: [table.roomTypeId, table.amenityCode] }),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
  ],
);
// ROOM-AMN (SRS v2.15): a room's own amenity set, used only when rooms.amenities_customized.
export const roomAmenities = pgTable(
  'room_amenities',
  {
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomId: uuid('room_id').notNull(),
    amenityCode: text('amenity_code')
      .notNull()
      .references(() => amenities.code),
  },
  (table) => [
    primaryKey({ columns: [table.roomId, table.amenityCode] }),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
  ],
);
export const favorites = pgTable(
  'favorites',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.branchId] }),
    index('favorites_branch_idx').on(table.branchId),
  ],
);

// Public reads require this explicit publication record plus a currently clean file.
export const listingMedia = pgTable(
  'listing_media',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id),
    // ROOM-002/003: null targets are hostel photos; a bed photo always names its room.
    roomId: uuid('room_id'),
    seatId: uuid('seat_id'),
    sortOrder: integer('sort_order').notNull(),
    altText: text('alt_text').notNull(),
    publishedByUserId: uuid('published_by_user_id').references(() => users.id),
    publishedAt: instant('published_at'),
    archivedAt: instant('archived_at'),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('listing_media_branch_idx').on(table.branchId, table.sortOrder),
    index('listing_media_file_idx').on(table.fileId),
    index('listing_media_room_idx')
      .on(table.roomId)
      .where(sql`${table.archivedAt} is null and ${table.publishedAt} is not null`),
    index('listing_media_seat_idx')
      .on(table.seatId)
      .where(sql`${table.archivedAt} is null and ${table.publishedAt} is not null`),
    foreignKey({
      columns: [table.branchId, table.roomId],
      foreignColumns: [rooms.branchId, rooms.id],
    }),
    foreignKey({
      columns: [table.branchId, table.roomId, table.seatId],
      foreignColumns: [seats.branchId, seats.roomId, seats.id],
    }),
    check(
      'listing_media_target_check',
      sql`${table.seatId} is null or ${table.roomId} is not null`,
    ),
    index('listing_media_public_order_idx')
      .on(table.branchId, table.sortOrder, table.id)
      .where(sql`${table.archivedAt} is null and ${table.publishedAt} is not null`),
    check('listing_media_order_check', sql`${table.sortOrder} >= 0`),
    check('listing_media_alt_check', sql`length(btrim(${table.altText})) between 1 and 240`),
    check(
      'listing_media_publication_pair_check',
      sql`
    (${table.publishedAt} is null) = (${table.publishedByUserId} is null)`,
    ),
  ],
);
