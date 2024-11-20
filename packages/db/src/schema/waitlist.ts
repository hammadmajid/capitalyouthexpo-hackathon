import { sql } from 'drizzle-orm';
import {
  date,
  foreignKey,
  index,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
  check,
} from 'drizzle-orm/pg-core';
import { identifier, instant } from './primitives.js';
import { users } from './identity.js';
import { branches } from './ownership.js';
import { roomTypes } from './inventory.js';
export const waitlistEntries = pgTable(
  'waitlist_entries',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    customerUserId: uuid('customer_user_id')
      .notNull()
      .references(() => users.id),
    roomTypeId: uuid('room_type_id'),
    joinedAt: instant('joined_at').notNull().defaultNow(),
    leftAt: instant('left_at'),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
    unique('waitlist_entries_branch_id_uq').on(table.branchId, table.id),
    uniqueIndex('waitlist_active_branch_uq')
      .on(table.customerUserId, table.branchId)
      .where(sql`${table.leftAt} is null and ${table.roomTypeId} is null`),
    uniqueIndex('waitlist_active_type_uq')
      .on(table.customerUserId, table.branchId, table.roomTypeId)
      .where(sql`${table.leftAt} is null and ${table.roomTypeId} is not null`),
    check(
      'waitlist_left_order_check',
      sql`${table.leftAt} is null or ${table.leftAt} >= ${table.joinedAt}`,
    ),
    index('waitlist_customer_page_idx').on(table.customerUserId, table.id),
    index('waitlist_branch_page_idx').on(table.branchId, table.id),
  ],
);
export const expectedVacancies = pgTable(
  'expected_vacancies',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    roomTypeId: uuid('room_type_id').notNull(),
    expectedVacancyDate: date('expected_vacancy_date'),
    updatedAt: instant('updated_at').notNull().defaultNow(),
  },
  (table) => [
    unique('expected_vacancy_type_uq').on(table.branchId, table.roomTypeId),
    foreignKey({
      columns: [table.branchId, table.roomTypeId],
      foreignColumns: [roomTypes.branchId, roomTypes.id],
    }),
  ],
);
