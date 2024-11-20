import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { stays } from './stays.js';
import { identifier, instant } from './primitives.js';
// SERV-001: one versioned weekly menu per branch; cells are replaced as a whole week with the
// expected version, and every change is audited (history lives in hostel_audit_log).
export const mealEnum = pgEnum('meal_enum', ['breakfast', 'lunch', 'dinner']);
export const branchMenus = pgTable(
  'branch_menus',
  {
    branchId: uuid('branch_id')
      .primaryKey()
      .references(() => branches.id),
    version: integer('version').notNull(),
    updatedByUserId: uuid('updated_by_user_id')
      .notNull()
      .references(() => users.id),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    check('branch_menus_version_check', sql`${table.version} > 0`),
    index('branch_menus_updater_idx').on(table.updatedByUserId),
  ],
);
export const menuItems = pgTable(
  'menu_items',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branchMenus.branchId),
    dayOfWeek: smallint('day_of_week').notNull(),
    meal: mealEnum('meal').notNull(),
    description: text('description').notNull(),
  },
  (table) => [
    unique('menu_items_cell_uq').on(table.branchId, table.dayOfWeek, table.meal),
    check('menu_items_day_check', sql`${table.dayOfWeek} between 1 and 7`),
    check('menu_items_text_check', sql`length(btrim(${table.description})) between 1 and 200`),
  ],
);
// SERV-001 / CHG-037: optional serving time per day and meal ("07:30"–"09:00", 24-hour), so
// weekdays and weekends can differ; saved with the menu version.
export const menuMealTimes = pgTable(
  'menu_meal_times',
  {
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branchMenus.branchId),
    dayOfWeek: smallint('day_of_week').notNull(),
    meal: mealEnum('meal').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
  },
  (table) => [
    unique('menu_meal_times_cell_uq').on(table.branchId, table.dayOfWeek, table.meal),
    check('menu_meal_times_day_check', sql`${table.dayOfWeek} between 1 and 7`),
    check(
      'menu_meal_times_clock_check',
      sql`${table.startsAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and ${table.endsAt} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check('menu_meal_times_order_check', sql`${table.startsAt} < ${table.endsAt}`),
  ],
);
// SERV-002: optional hostel-run transport with a visible separate monthly charge.
export const transportRouteStatus = pgEnum('transport_route_status_enum', ['active', 'inactive']);
// CHG-042: transport is either a separate monthly charge or included in agreed rent.
export const transportPricingMode = pgEnum('transport_pricing_mode_enum', ['separate', 'included']);
export const transportRoutes = pgTable(
  'transport_routes',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    name: text('name').notNull(),
    description: text('description'),
    monthlyChargePaisa: bigint('monthly_charge_paisa', { mode: 'bigint' }).notNull(),
    departureTimes: text('departure_times').array().notNull(),
    stops: text('stops').array().notNull(),
    // Parallel to `stops`: both | pickup | dropoff (empty for legacy rows, read as both).
    stopRoles: text('stop_roles')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    pricingMode: transportPricingMode('pricing_mode').notNull().default('separate'),
    includedFrom: date('included_from'),
    status: transportRouteStatus('status').notNull(),
    version: integer('version').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('transport_routes_scope_uq').on(table.branchId, table.id),
    index('transport_routes_branch_idx').on(table.branchId, table.status, table.id),
    index('transport_routes_creator_idx').on(table.createdByUserId),
    check('transport_routes_name_check', sql`length(btrim(${table.name})) between 1 and 120`),
    check(
      'transport_routes_description_check',
      sql`${table.description} is null or length(btrim(${table.description})) between 1 and 500`,
    ),
    check(
      'transport_routes_pricing_check',
      sql`(${table.pricingMode} = 'separate' and ${table.monthlyChargePaisa} between 0 and 9007199254740991 and ${table.includedFrom} is null) or (${table.pricingMode} = 'included' and ${table.monthlyChargePaisa} = 0 and ${table.includedFrom} is not null)`,
    ),
    check(
      'transport_routes_lists_check',
      sql`cardinality(${table.departureTimes}) <= 12 and cardinality(${table.stops}) <= 30 and (cardinality(${table.stopRoles}) = 0 or cardinality(${table.stopRoles}) = cardinality(${table.stops})) and ${table.stopRoles} <@ array['both','pickup','dropoff']::text[]`,
    ),
    check('transport_routes_version_check', sql`${table.version} > 0`),
  ],
);
export const transportSubscriptionStatus = pgEnum('transport_subscription_status_enum', [
  'requested',
  'active',
  'ended',
  'rejected',
  'withdrawn',
]);
// p.32 charge lifecycle: the price the resident saw is captured at the request; approval and
// end carry explicit effective dates; one live subscription per Stay.
export const transportSubscriptions = pgTable(
  'transport_subscriptions',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    routeId: uuid('route_id').notNull(),
    status: transportSubscriptionStatus('status').notNull(),
    monthlyChargePaisa: bigint('monthly_charge_paisa', { mode: 'bigint' }).notNull(),
    effectiveFrom: date('effective_from'),
    effectiveTo: date('effective_to'),
    endRequestedAt: instant('end_requested_at'),
    decidedByUserId: uuid('decided_by_user_id').references(() => users.id),
    reason: text('reason'),
    version: integer('version').notNull(),
    createdAt: instant('created_at').notNull().defaultNow(),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    foreignKey({
      columns: [table.branchId, table.routeId],
      foreignColumns: [transportRoutes.branchId, transportRoutes.id],
    }),
    // CHG-042: one branch-wide request or active subscription for a Stay.
    uniqueIndex('transport_subscriptions_live_uq')
      .on(table.stayId)
      .where(sql`${table.status} in ('requested', 'active')`),
    index('transport_subscriptions_branch_idx').on(table.branchId, table.status, table.id),
    index('transport_subscriptions_route_idx').on(table.branchId, table.routeId),
    index('transport_subscriptions_decider_idx').on(table.decidedByUserId),
    check(
      'transport_subscriptions_charge_check',
      sql`${table.monthlyChargePaisa} between 1 and 9007199254740991`,
    ),
    check(
      'transport_subscriptions_dates_check',
      sql`(${table.status} in ('active','ended')) = (${table.effectiveFrom} is not null) and (${table.status} = 'ended') = (${table.effectiveTo} is not null) and (${table.effectiveTo} is null or ${table.effectiveTo} > ${table.effectiveFrom})`,
    ),
    check(
      'transport_subscriptions_decision_check',
      sql`(${table.status} in ('active','ended','rejected')) = (${table.decidedByUserId} is not null) and (${table.status} <> 'rejected' or length(btrim(coalesce(${table.reason}, ''))) between 1 and 500)`,
    ),
    check('transport_subscriptions_version_check', sql`${table.version} > 0`),
  ],
);
