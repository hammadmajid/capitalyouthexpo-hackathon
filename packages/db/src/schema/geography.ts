import { sql } from 'drizzle-orm';
import { users } from './identity.js';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { areaLevel, placeType } from './enums.js';
import { citext, geography, identifier, instant } from './primitives.js';

export const cities = pgTable('cities', {
  id: identifier(),
  name: text('name').notNull(),
  slug: citext('slug').notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  sortOrder: integer('sort_order').notNull().default(0),
});
export const areas = pgTable(
  'areas',
  {
    id: identifier(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    parentId: uuid('parent_id').references((): AnyPgColumn => areas.id),
    level: areaLevel('level').notNull(),
    name: text('name').notNull(),
    slug: citext('slug').notNull(),
    centroid: geography('centroid'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    unique('areas_city_slug_uq').on(table.cityId, table.slug),
    unique('areas_city_id_uq').on(table.cityId, table.id),
    foreignKey({
      columns: [table.cityId, table.parentId],
      foreignColumns: [table.cityId, table.id],
      name: 'areas_parent_city_fk',
    }),
    index('areas_parent_idx').on(table.parentId),
    index('areas_centroid_idx').using('gist', table.centroid),
  ],
);
export const places = pgTable(
  'places',
  {
    id: identifier(),
    type: placeType('type').notNull(),
    name: text('name').notNull(),
    shortName: text('short_name'),
    slug: citext('slug').notNull().unique(),
    cityId: uuid('city_id')
      .notNull()
      .references(() => cities.id),
    areaId: uuid('area_id'),
    address: text('address'),
    location: geography('location').notNull(),
    publicApprovedAt: instant('public_approved_at'),
    publicApprovedByUserId: uuid('public_approved_by_user_id').references(
      (): AnyPgColumn => users.id,
    ),
    isActive: boolean('is_active').notNull().default(true),
  },
  (table) => [
    foreignKey({ columns: [table.cityId, table.areaId], foreignColumns: [areas.cityId, areas.id] }),
    check(
      'places_public_approval_pair_check',
      sql`(${table.publicApprovedAt} is null) = (${table.publicApprovedByUserId} is null)`,
    ),
    index('places_city_idx').on(table.cityId),
    index('places_area_idx').on(table.areaId),
    index('places_location_idx').using('gist', table.location),
  ],
);
