import { sql } from 'drizzle-orm';
import { bigint, check, foreignKey, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';
import { roomTypes } from './inventory.js';
import { managerAssignments, branches } from './ownership.js';
import { instant } from './primitives.js';

export const roomTypeFees = pgTable(
  'room_type_fees',
  {
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id').notNull(),
    code: text('code').notNull(),
    cadence: text('cadence').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.roomTypeId, table.code, table.cadence] }),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    check('room_type_fees_code_check', sql`${table.code} in ('mess', 'utilities', 'admission')`),
    check('room_type_fees_cadence_check', sql`${table.cadence} in ('monthly', 'one_time')`),
    check('room_type_fees_amount_check', sql`${table.amountPaisa} >= 0`),
  ],
);

// Grants can only restrict a currently active, exactly branch-scoped assignment.
export const managerInventoryGrants = pgTable(
  'manager_inventory_grants',
  {
    assignmentId: uuid('assignment_id')
      .notNull()
      .references(() => managerAssignments.id),
    permission: text('permission').notNull(),
    grantedAt: instant('granted_at').notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.assignmentId, table.permission] }),
    check(
      'manager_inventory_grants_permission_check',
      sql`${table.permission} in (
    'listing_edit', 'inventory_edit', 'pricing_edit', 'policy_edit',
    'media_publish', 'block_manage', 'booking_manage', 'document_review',
    'stay_manage', 'rent_manage', 'payment_record', 'finance_view', 'checkout_manage',
    'staff_manage', 'staff_payroll_manage')`,
    ),
  ],
);
