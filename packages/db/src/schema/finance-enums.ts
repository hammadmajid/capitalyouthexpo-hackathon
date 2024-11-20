import { pgEnum } from 'drizzle-orm/pg-core';
export const residentChargeKind = pgEnum('resident_charge_kind_enum', [
  'rent',
  'mess',
  'utilities',
  'admission',
  'custom',
  'late_fee',
  'transport',
]);
export const residentLedgerAccount = pgEnum('resident_ledger_account_enum', [
  'receivable',
  'deposit',
  'advance',
]);
export const residentLedgerSide = pgEnum('resident_ledger_side_enum', ['debit', 'credit']);
export const externalPaymentMethod = pgEnum('external_payment_method_enum', [
  'cash',
  'bank_transfer',
  'jazzcash',
  'easypaisa',
  'other',
]);
export const invoiceDocumentState = pgEnum('invoice_document_state_enum', ['issued', 'voided']);
export const residentFundMovementKind = pgEnum('resident_fund_movement_kind_enum', [
  'deposit_apply',
  'deposit_deduct',
  'deposit_refund',
  'advance_apply',
  'advance_refund',
]);

export const residentAdjustmentKind = pgEnum('resident_adjustment_kind_enum', [
  'correction',
  'discount',
  'waiver',
  'agreement_amendment',
]);
