import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  unique,
  uuid,
  bigint,
} from 'drizzle-orm/pg-core';
import { branches } from './ownership.js';
import { users } from './identity.js';
import { stayAgreements } from './stay-agreements.js';
import { residentChargeKind, residentLedgerSide, residentAdjustmentKind } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

// FIN-004 / CHG-009: a controlled Owner-approved catalog, not ad-hoc invoice fee text.
export const residentChargeCatalog = pgTable(
  'resident_charge_catalog',
  {
    id: identifier(),
    branchId: uuid('branch_id')
      .notNull()
      .references(() => branches.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    unitLabel: text('unit_label').notNull(),
    unitAmountPaisa: bigint('unit_amount_paisa', { mode: 'bigint' }).notNull(),
    createdByUserId: uuid('created_by_user_id')
      .notNull()
      .references(() => users.id),
    createdAt: instant('created_at').notNull().defaultNow(),
    archivedAt: instant('archived_at'),
  },
  (table) => [
    unique('resident_charge_catalog_scope_uq').on(table.branchId, table.id),
    unique('resident_charge_catalog_code_uq').on(table.branchId, table.code),
    check(
      'resident_charge_catalog_unit_check',
      sql`length(btrim(${table.unitLabel})) between 1 and 40 and ${table.unitAmountPaisa} > 0`,
    ),
    check('resident_charge_catalog_code_check', sql`${table.code} ~ '^[a-z][a-z0-9_]{0,63}$'`),
    check(
      'resident_charge_catalog_name_check',
      sql`length(btrim(${table.name})) between 1 and 120`,
    ),
  ],
);

// RENT-003/004: posted charge snapshots are immutable. Corrections are separate records.
export const residentCharges = pgTable(
  'resident_charges',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    agreementId: uuid('agreement_id').notNull(),
    catalogId: uuid('catalog_id'),
    kind: residentChargeKind('kind').notNull(),
    sourceKey: text('source_key').notNull(),
    descriptionSnapshot: text('description_snapshot').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    quantity: integer('quantity').notNull(),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    postedByUserId: uuid('posted_by_user_id').references(() => users.id),
    postedAt: instant('posted_at').notNull().defaultNow(),
  },
  (table) => [
    unique('resident_charges_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_charges_agreement_scope_uq').on(
      table.branchId,
      table.stayId,
      table.agreementId,
      table.id,
    ),
    unique('resident_charges_source_uq').on(table.stayId, table.sourceKey),
    check(
      'resident_charges_quantity_check',
      sql`${table.quantity} > 0 and (${table.kind} = 'custom' or ${table.quantity} = 1)`,
    ),
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId],
      foreignColumns: [stayAgreements.branchId, stayAgreements.stayId, stayAgreements.id],
    }),
    foreignKey({
      columns: [table.branchId, table.catalogId],
      foreignColumns: [residentChargeCatalog.branchId, residentChargeCatalog.id],
    }),
    check(
      'resident_charges_catalog_check',
      sql`(${table.kind} = 'custom') = (${table.catalogId} is not null)`,
    ),
    check('resident_charges_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'resident_charges_description_check',
      sql`length(btrim(${table.descriptionSnapshot})) between 1 and 240`,
    ),
    check(
      'resident_charges_source_check',
      sql`length(btrim(${table.sourceKey})) between 1 and 240`,
    ),
    check(
      'resident_charges_period_check',
      sql`(${table.periodStart} is null and ${table.periodEnd} is null) or (${table.periodStart} is not null and ${table.periodEnd} is not null and ${table.periodStart} < ${table.periodEnd})`,
    ),
    index('resident_charges_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);

export const residentChargeAdjustments = pgTable(
  'resident_charge_adjustments',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    chargeId: uuid('charge_id').notNull(),
    agreementId: uuid('agreement_id'),
    kind: residentAdjustmentKind('kind').notNull(),
    sourceKey: text('source_key').notNull(),
    side: residentLedgerSide('side').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    reason: text('reason').notNull(),
    postedByUserId: uuid('posted_by_user_id')
      .notNull()
      .references(() => users.id),
    postedAt: instant('posted_at').notNull().defaultNow(),
  },
  (table) => [
    unique('resident_charge_adjustments_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_charge_adjustments_source_uq').on(table.stayId, table.sourceKey),
    foreignKey({
      columns: [table.branchId, table.stayId, table.chargeId],
      foreignColumns: [residentCharges.branchId, residentCharges.stayId, residentCharges.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.agreementId],
      foreignColumns: [stayAgreements.branchId, stayAgreements.stayId, stayAgreements.id],
    }),
    check(
      'resident_charge_adjustments_agreement_check',
      sql`${table.kind} <> 'agreement_amendment' or ${table.agreementId} is not null`,
    ),
    check('resident_charge_adjustments_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'resident_charge_adjustments_reason_check',
      sql`length(btrim(${table.reason})) between 1 and 500`,
    ),
    check(
      'resident_charge_adjustments_source_check',
      sql`length(btrim(${table.sourceKey})) between 1 and 240`,
    ),
    index('resident_charge_adjustments_page_idx').on(table.branchId, table.stayId, table.id),
  ],
);
