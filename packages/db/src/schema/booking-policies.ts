import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { brands, branches } from './ownership.js';
import { roomTypes } from './inventory.js';
import { identifier, instant } from './primitives.js';

// Append immutable versions; supersession changes only isCurrent. No guessed defaults.
export const bookingPolicies = pgTable(
  'booking_policies',
  {
    id: identifier(),
    brandId: uuid('brand_id').references(() => brands.id),
    branchId: uuid('branch_id').references(() => branches.id),
    roomTypeId: uuid('room_type_id'),
    policy: jsonb('policy').$type<Record<string, unknown>>().notNull(),
    platformLimits: jsonb('platform_limits').$type<Record<string, unknown>>(),
    isCurrent: boolean('is_current').notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    check(
      'booking_policies_scope_check',
      sql`
    (${table.brandId} is null or (${table.branchId} is null and ${table.roomTypeId} is null))
    and (${table.roomTypeId} is null or ${table.branchId} is not null)`,
    ),
    check(
      'booking_policies_limits_check',
      sql`
    (${table.brandId} is null and ${table.branchId} is null and ${table.platformLimits} is not null)
    or ((${table.brandId} is not null or ${table.branchId} is not null) and ${table.platformLimits} is null)`,
    ),
    check(
      'booking_policies_json_check',
      sql`jsonb_typeof(${table.policy}) = 'object'
    and (${table.platformLimits} is null or jsonb_typeof(${table.platformLimits}) = 'object')`,
    ),
    // eslint-disable-next-line no-secrets/no-secrets -- Public database constraint name, not a credential.
    uniqueIndex('booking_policies_platform_current_uq')
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} and ${table.brandId} is null and ${table.branchId} is null`),
    uniqueIndex('booking_policies_brand_current_uq')
      .on(table.brandId)
      .where(sql`${table.isCurrent} and ${table.brandId} is not null`),
    uniqueIndex('booking_policies_branch_current_uq')
      .on(table.branchId)
      .where(
        sql`${table.isCurrent} and ${table.branchId} is not null and ${table.roomTypeId} is null`,
      ),
    uniqueIndex('booking_policies_type_current_uq')
      .on(table.roomTypeId)
      .where(sql`${table.isCurrent} and ${table.roomTypeId} is not null`),
    index('booking_policies_creator_idx').on(table.createdByUserId),
  ],
);
