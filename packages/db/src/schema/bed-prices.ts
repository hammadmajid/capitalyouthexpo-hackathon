import { sql } from 'drizzle-orm';
import { bigint, check, date, foreignKey, index, pgTable, uuid } from 'drizzle-orm/pg-core';
import { seats } from './inventory.js';
import { users } from './identity.js';
import { identifier, instant } from './primitives.js';
// CHG-056: append-only price versions, scoped to one physical bed; no resident repricing.
export const bedPrices = pgTable(
  'bed_prices',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    roomId: uuid('room_id').notNull(),
    bedId: uuid('bed_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    monthlyRentPaisa: bigint('monthly_rent_paisa', { mode: 'bigint' }).notNull(),
    depositPaisa: bigint('deposit_paisa', { mode: 'bigint' }),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.roomId, table.bedId],
      foreignColumns: [seats.branchId, seats.roomId, seats.id],
    }),
    index('bed_prices_effective_idx').on(
      table.branchId,
      table.bedId,
      table.effectiveFrom,
      table.id,
    ),
    check(
      'bed_prices_deposit_check',
      sql`${table.depositPaisa} is null or ${table.depositPaisa} between 0 and 9007199254740991`,
    ),
    check('bed_prices_money_check', sql`${table.monthlyRentPaisa} between 0 and 9007199254740991`),
  ],
);
