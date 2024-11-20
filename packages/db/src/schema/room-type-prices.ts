import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  jsonb,
  pgTable,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { disclosedFeeSchema } from '@hsm/contracts';
import { roomTypes } from './inventory.js';
import { users } from './identity.js';
import { identifier, instant } from './primitives.js';

export const roomTypePrices = pgTable(
  'room_type_prices',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    roomTypeId: uuid('room_type_id').notNull(),
    effectiveFrom: date('effective_from').notNull(),
    bedMonthlyRentPaisa: bigint('bed_monthly_rent_paisa', { mode: 'bigint' }),
    roomMonthlyRentPaisa: bigint('room_monthly_rent_paisa', { mode: 'bigint' }),
    depositPaisa: bigint('deposit_paisa', { mode: 'bigint' }).notNull(),
    fees: jsonb('fees').$type<z.infer<typeof disclosedFeeSchema>[]>().notNull(),
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
    unique('room_type_prices_date_uq').on(table.roomTypeId, table.effectiveFrom),
    index('room_type_prices_branch_idx').on(table.branchId, table.roomTypeId, table.effectiveFrom),
    check(
      'room_type_prices_money_check',
      sql`${table.depositPaisa} between 0 and 9007199254740991 and (${table.bedMonthlyRentPaisa} is null or ${table.bedMonthlyRentPaisa} between 0 and 9007199254740991) and (${table.roomMonthlyRentPaisa} is null or ${table.roomMonthlyRentPaisa} between 0 and 9007199254740991)`,
    ),
    check(
      'room_type_prices_fees_check',
      sql`jsonb_typeof(${table.fees}) = 'array' and jsonb_array_length(${table.fees}) <= 32`,
    ),
  ],
);
