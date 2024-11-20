import { bigint, boolean, integer, jsonb, pgView, text, uuid } from 'drizzle-orm/pg-core';
import type { z } from 'zod';
import type { disclosedFeeSchema } from '@hsm/contracts';
import { inventoryMode } from './inventory-enums.js';
import { instant } from './primitives.js';

// Defined by the additive migration: Pakistan calendar date, latest due version.
// Legacy values remain the fallback until the first explicit price takes effect.
export const currentRoomTypes = pgView('current_room_types', {
  id: uuid('id').notNull(),
  branchId: uuid('branch_id').notNull(),
  name: text('name').notNull(),
  inventoryMode: inventoryMode('inventory_mode').notNull(),
  capacity: integer('capacity').notNull(),
  bedMonthlyRentPaisa: bigint('bed_monthly_rent_paisa', { mode: 'bigint' }),
  roomMonthlyRentPaisa: bigint('room_monthly_rent_paisa', { mode: 'bigint' }),
  depositPaisa: bigint('deposit_paisa', { mode: 'bigint' }).notNull(),
  createdAt: instant('created_at').notNull(),
  updatedAt: instant('updated_at').notNull(),
  archivedAt: instant('archived_at'),
  priceVersionId: uuid('price_version_id'),
  priceFees: jsonb('price_fees').$type<z.infer<typeof disclosedFeeSchema>[] | null>(),
  setupManaged: boolean('setup_managed').notNull(),
}).existing();
