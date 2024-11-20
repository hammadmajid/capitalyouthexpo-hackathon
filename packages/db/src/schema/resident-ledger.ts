import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  foreignKey,
  index,
  pgTable,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { residentCharges, residentChargeAdjustments } from './resident-charges.js';
import { residentPayments, residentPaymentReversals } from './resident-payments.js';
import { residentInvoices } from './resident-invoices.js';
import { residentFundMovements } from './resident-funds.js';
import { residentLedgerAccount, residentLedgerSide } from './finance-enums.js';
import { identifier, instant } from './primitives.js';

// FIN-001 / PAY-008: immutable source-linked postings, including invoice allocations.
// Receivable = debits - credits; deposit/advance held = credits - debits.
export const residentLedger = pgTable(
  'resident_ledger',
  {
    id: identifier(),
    branchId: uuid('branch_id').notNull(),
    stayId: uuid('stay_id').notNull(),
    account: residentLedgerAccount('account').notNull(),
    side: residentLedgerSide('side').notNull(),
    amountPaisa: bigint('amount_paisa', { mode: 'bigint' }).notNull(),
    invoiceId: uuid('invoice_id'),
    chargeId: uuid('charge_id'),
    adjustmentId: uuid('adjustment_id'),
    paymentId: uuid('payment_id'),
    fundMovementId: uuid('fund_movement_id'),
    paymentReversalId: uuid('payment_reversal_id'),
    fundingPaymentId: uuid('funding_payment_id'),
    reversedEntryId: uuid('reversed_entry_id').references((): AnyPgColumn => residentLedger.id),
    postedAt: instant('posted_at').notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.branchId, table.stayId, table.chargeId],
      foreignColumns: [residentCharges.branchId, residentCharges.stayId, residentCharges.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.adjustmentId],
      foreignColumns: [
        residentChargeAdjustments.branchId,
        residentChargeAdjustments.stayId,
        residentChargeAdjustments.id,
      ],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.fundingPaymentId],
      foreignColumns: [residentPayments.branchId, residentPayments.stayId, residentPayments.id],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.fundMovementId],
      foreignColumns: [
        residentFundMovements.branchId,
        residentFundMovements.stayId,
        residentFundMovements.id,
      ],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.paymentReversalId],
      foreignColumns: [
        residentPaymentReversals.branchId,
        residentPaymentReversals.stayId,
        residentPaymentReversals.id,
      ],
    }),
    foreignKey({
      columns: [table.branchId, table.stayId, table.invoiceId],
      foreignColumns: [residentInvoices.branchId, residentInvoices.stayId, residentInvoices.id],
    }),
    check(
      'resident_ledger_source_check',
      sql`num_nonnulls(${table.chargeId},${table.adjustmentId},${table.paymentId},${table.fundMovementId},${table.paymentReversalId}) = 1`,
    ),
    check('resident_ledger_amount_check', sql`${table.amountPaisa} > 0`),
    check(
      'resident_ledger_funding_check',
      sql`((${table.paymentId} is not null or ${table.fundMovementId} is not null or ${table.paymentReversalId} is not null) = (${table.fundingPaymentId} is not null)) and (${table.paymentId} is null or ${table.paymentId} = ${table.fundingPaymentId})`,
    ),
    check(
      'resident_ledger_reversal_check',
      sql`(${table.paymentReversalId} is not null) = (${table.reversedEntryId} is not null) and (${table.reversedEntryId} is null or ${table.reversedEntryId} <> ${table.id})`,
    ),
    check(
      'resident_ledger_invoice_account_check',
      sql`${table.invoiceId} is null or ${table.account} = 'receivable'`,
    ),
    uniqueIndex('resident_ledger_charge_uq')
      .on(table.chargeId)
      .where(sql`${table.chargeId} is not null`),
    uniqueIndex('resident_ledger_adjustment_uq')
      .on(table.adjustmentId)
      .where(sql`${table.adjustmentId} is not null`),
    uniqueIndex('resident_ledger_payment_invoice_uq')
      .on(table.paymentId, table.invoiceId)
      .where(sql`${table.paymentId} is not null and ${table.account} = 'receivable'`),
    uniqueIndex('resident_ledger_payment_fund_uq')
      .on(table.paymentId, table.account)
      .where(sql`${table.paymentId} is not null and ${table.account} <> 'receivable'`),
    uniqueIndex('resident_ledger_movement_account_uq')
      .on(table.fundMovementId, table.account)
      .where(sql`${table.fundMovementId} is not null`),
    uniqueIndex('resident_ledger_reversed_entry_uq')
      .on(table.reversedEntryId)
      .where(sql`${table.reversedEntryId} is not null`),
    index('resident_ledger_page_idx').on(table.branchId, table.stayId, table.id),
    index('resident_ledger_funding_idx').on(
      table.branchId,
      table.stayId,
      table.fundingPaymentId,
      table.account,
    ),
    index('resident_ledger_invoice_idx').on(table.branchId, table.stayId, table.invoiceId),
  ],
);
