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

// RENT-001/003: explicit, versioned financial policy. Never inferred from mutable settings.
export const billingPolicies = pgTable(
  'billing_policies',
  {
    id: identifier(),
    brandId: uuid('brand_id').references(() => brands.id),
    branchId: uuid('branch_id').references(() => branches.id),
    roomTypeId: uuid('room_type_id'),
    policy: jsonb('policy').$type<Record<string, unknown>>().notNull(),
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
      'billing_policies_scope_check',
      sql`(${table.brandId} is null or (${table.branchId} is null and ${table.roomTypeId} is null)) and (${table.roomTypeId} is null or ${table.branchId} is not null)`,
    ),
    check('billing_policies_json_check', sql`jsonb_typeof(${table.policy}) = 'object'`),
    uniqueIndex('billing_policies_platform_current_uq')
      .on(table.isCurrent)
      .where(sql`${table.isCurrent} and ${table.brandId} is null and ${table.branchId} is null`),
    uniqueIndex('billing_policies_brand_current_uq')
      .on(table.brandId)
      .where(sql`${table.isCurrent} and ${table.brandId} is not null`),
    uniqueIndex('billing_policies_branch_current_uq')
      .on(table.branchId)
      .where(
        sql`${table.isCurrent} and ${table.branchId} is not null and ${table.roomTypeId} is null`,
      ),
    uniqueIndex('billing_policies_type_current_uq')
      .on(table.roomTypeId)
      .where(sql`${table.isCurrent} and ${table.roomTypeId} is not null`),
    index('billing_policies_creator_idx').on(table.createdByUserId),
  ],
);
