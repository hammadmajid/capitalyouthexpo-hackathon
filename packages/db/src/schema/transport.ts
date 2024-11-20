import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { areas, places } from './geography.js';
import { transportRoutes } from './resident-services.js';
import { identifier } from './primitives.js';
// CHG-042 / SRS v2.30: what a route covers and when it runs. Both are owned by their route and
// replaced together on each versioned route save; the audit log keeps every earlier version.
export const transportDestinationKind = pgEnum('transport_destination_kind_enum', [
  'university',
  'office',
  'area',
  'other',
]);
export const transportDestinations = pgTable(
  'transport_destinations',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    routeId: uuid('route_id').notNull(),
    position: smallint('position').notNull(),
    kind: transportDestinationKind('kind').notNull(),
    name: text('name').notNull(),
    placeId: uuid('place_id').references(() => places.id),
    areaId: uuid('area_id').references(() => areas.id),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.routeId],
      foreignColumns: [transportRoutes.branchId, transportRoutes.id],
    }),
    unique('transport_destinations_position_uq').on(table.routeId, table.position),
    index('transport_destinations_branch_idx').on(table.branchId, table.routeId),
    index('transport_destinations_place_idx').on(table.placeId),
    index('transport_destinations_area_idx').on(table.areaId),
    check('transport_destinations_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check('transport_destinations_position_check', sql`${table.position} between 0 and 19`),
    check(
      'transport_destinations_reference_check',
      sql`${table.placeId} is null or ${table.areaId} is null`,
    ),
  ],
);
// Wall-clock "HH:MM" in Asia/Karachi; *_next_day marks a time after midnight of the departure
// day. A null return means a deliberately one-way trip. Days: 1 = Monday .. 7 = Sunday.
export const transportTrips = pgTable(
  'transport_trips',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    routeId: uuid('route_id').notNull(),
    position: smallint('position').notNull(),
    days: smallint('days').array().notNull(),
    outboundDeparts: text('outbound_departs').notNull(),
    outboundArrives: text('outbound_arrives'),
    outboundArrivesNextDay: boolean('outbound_arrives_next_day').notNull().default(false),
    returnDeparts: text('return_departs'),
    returnDepartsNextDay: boolean('return_departs_next_day').notNull().default(false),
    returnArrives: text('return_arrives'),
    returnArrivesNextDay: boolean('return_arrives_next_day').notNull().default(false),
    effectiveFrom: date('effective_from').notNull(),
    active: boolean('active').notNull().default(true),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.routeId],
      foreignColumns: [transportRoutes.branchId, transportRoutes.id],
    }),
    unique('transport_trips_position_uq').on(table.routeId, table.position),
    index('transport_trips_branch_idx').on(table.branchId, table.routeId),
    check('transport_trips_position_check', sql`${table.position} between 0 and 23`),
    check(
      'transport_trips_days_check',
      sql`cardinality(${table.days}) between 1 and 7 and ${table.days} <@ array[1,2,3,4,5,6,7]::smallint[]`,
    ),
    check(
      'transport_trips_clock_check',
      sql`${table.outboundDeparts} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and (${table.outboundArrives} is null or ${table.outboundArrives} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and (${table.returnDeparts} is null or ${table.returnDeparts} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') and (${table.returnArrives} is null or ${table.returnArrives} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$')`,
    ),
    check(
      'transport_trips_return_check',
      sql`${table.returnDeparts} is not null or ${table.returnArrives} is null`,
    ),
  ],
);
