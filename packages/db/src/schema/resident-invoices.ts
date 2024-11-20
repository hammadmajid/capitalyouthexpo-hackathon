import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';
import { stays } from './stays.js';
import { residentCharges } from './resident-charges.js';
import { invoiceDocumentState } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

// RENT-003 / PAY-008: issued face value is immutable; Paid is derived from approved receipt-backed postings.
export const residentInvoices = pgTable(
  'resident_invoices',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    number: text('number').notNull(),
    totalPaisa: bigint('total_paisa', { mode: 'bigint' }).notNull(),
    dueDate: date('due_date').notNull(),
    state: invoiceDocumentState('state').notNull(),
    issuedByUserId: uuid('issued_by_user_id').references(() => users.id),
    issuedAt: instant('issued_at').notNull().defaultNow(),
    voidedByUserId: uuid('voided_by_user_id').references(() => users.id),
    voidedAt: instant('voided_at'),
    voidReason: text('void_reason'),
  },
  (table) => [
    unique('resident_invoices_scope_uq').on(table.branchId, table.stayId, table.id),
    unique('resident_invoices_number_uq').on(table.branchId, table.number),
    foreignKey({
      columns: [table.branchId, table.stayId],
      foreignColumns: [stays.branchId, stays.id],
    }),
    check('resident_invoices_number_check', sql`length(${table.number}) between 1 and 64`),
    check('resident_invoices_total_check', sql`${table.totalPaisa} >= 0`),
    check(
      'resident_invoices_void_check',
      sql`(${table.state} = 'issued' and num_nonnulls(${table.voidedAt},${table.voidedByUserId},${table.voidReason}) = 0) or (${table.state} = 'voided' and num_nonnulls(${table.voidedAt},${table.voidedByUserId},${table.voidReason}) = 3 and length(btrim(${table.voidReason})) between 1 and 500 and ${table.voidedAt} >= ${table.issuedAt})`,
    ),
    index('resident_invoices_page_idx').on(table.branchId, table.stayId, table.id),
    index('resident_invoices_due_idx').on(table.branchId, table.dueDate, table.id),
  ],
);
export const residentInvoiceCharges = pgTable(
  'resident_invoice_charges',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    invoiceId: uuid('invoice_id').notNull(),
    chargeId: uuid('charge_id').notNull(),
  },
  (table) => [
    unique('resident_invoice_charges_charge_uq').on(table.chargeId),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.chargeId],
      foreignColumns: [residentCharges.branchId, residentCharges.stayId, residentCharges.id],
    }),
    index('resident_invoice_charges_invoice_idx').on(table.branchId, table.stayId, table.invoiceId),
  ],
);
