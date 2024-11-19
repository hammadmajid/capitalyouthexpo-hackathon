import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { billingGraceDaysSchema } from './billing-policy.js';
import { rentDays } from './rent-calendar.js';
import { money, moneyFromJson, moneyJsonSchema, moneyToJson } from './money.js';

// Zod refinements can run on dirty numeric parses; never coerce invalid paisa to bigint.
const validMoneyFields = (value: Record<string, number>) =>
  z.record(moneyJsonSchema).safeParse(value).success;

export const invoiceFinancialStateSchema = z.enum([
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'no_charge',
  'voided',
]);
export const invoiceTotalsSchema = z
  .object({
    totalPaisa: moneyJsonSchema,
    debitAdjustmentsPaisa: moneyJsonSchema,
    creditAdjustmentsPaisa: moneyJsonSchema,
    // Server aggregate of current approved allocations JOINed to their immutable receipts.
    allocatedPaisa: moneyJsonSchema,
  })
  .strict()
  .refine(
    (value) =>
      validMoneyFields(value) &&
      BigInt(value.creditAdjustmentsPaisa) + BigInt(value.allocatedPaisa) <=
        BigInt(value.totalPaisa) + BigInt(value.debitAdjustmentsPaisa),
    'Excess payment must remain resident credit, never a negative invoice',
  );
export const invoiceBalanceInputSchema = z
  .object({
    totals: invoiceTotalsSchema,
    dueDate: calendarDateSchema,
    today: calendarDateSchema,
    graceDays: billingGraceDaysSchema,
    voided: z.boolean(),
  })
  .strict()
  .refine(
    (value) => !value.voided || value.totals.allocatedPaisa === 0,
    'Approved allocations must be reversed before voiding an invoice',
  )
  .refine(
    (value) =>
      !value.voided ||
      (invoiceTotalsSchema.safeParse(value.totals).success &&
        BigInt(value.totals.creditAdjustmentsPaisa) ===
          BigInt(value.totals.totalPaisa) + BigInt(value.totals.debitAdjustmentsPaisa)),
    'Voiding requires an explicit balancing credit, not hidden ledger debt',
  );

// PAY-008/009 / FIN-001: pure projection of authoritative posted totals, never client payment proof.
// Repositories must aggregate receipt-backed approved allocations in the scoped transaction.
export function invoiceBalance(input: unknown) {
  const value = invoiceBalanceInputSchema.parse(input);
  const total = moneyFromJson(value.totals.totalPaisa);
  const debit = moneyFromJson(value.totals.debitAdjustmentsPaisa);
  const credit = moneyFromJson(value.totals.creditAdjustmentsPaisa);
  const allocated = moneyFromJson(value.totals.allocatedPaisa);
  const outstanding = value.voided ? 0n : total + debit - credit - allocated;
  let state: z.infer<typeof invoiceFinancialStateSchema>;
  if (value.voided) state = 'voided';
  else if (outstanding === 0n) state = allocated > 0n ? 'paid' : 'no_charge';
  else if (rentDays(value.dueDate, value.today) > BigInt(value.graceDays)) state = 'overdue';
  else state = allocated > 0n ? 'partially_paid' : 'issued';
  return { ...value.totals, outstandingPaisa: moneyToJson(money(outstanding)), state };
}

export const paymentDistributionSchema = z
  .object({
    amountPaisa: moneyJsonSchema.gt(0),
    allocatedPaisa: moneyJsonSchema,
    depositPaisa: moneyJsonSchema,
    advanceCreditPaisa: moneyJsonSchema,
  })
  .strict()
  .refine(
    (value) =>
      validMoneyFields(value) &&
      BigInt(value.amountPaisa) ===
        BigInt(value.allocatedPaisa) +
          BigInt(value.depositPaisa) +
          BigInt(value.advanceCreditPaisa),
    'Every received paisa must be allocated, held as deposit or retained as advance credit',
  );
export const depositTotalsSchema = z
  .object({
    receivedPaisa: moneyJsonSchema,
    deductedPaisa: moneyJsonSchema,
    appliedToRentPaisa: moneyJsonSchema,
    refundedPaisa: moneyJsonSchema,
  })
  .strict()
  .refine(
    (value) =>
      validMoneyFields(value) &&
      BigInt(value.deductedPaisa) +
        BigInt(value.appliedToRentPaisa) +
        BigInt(value.refundedPaisa) <=
        BigInt(value.receivedPaisa),
    'Deposit movements exceed recorded receipts',
  );
export function depositBalance(input: unknown) {
  const value = depositTotalsSchema.parse(input);
  const held =
    moneyFromJson(value.receivedPaisa) -
    moneyFromJson(value.deductedPaisa) -
    moneyFromJson(value.appliedToRentPaisa) -
    moneyFromJson(value.refundedPaisa);
  return { ...value, heldPaisa: moneyToJson(money(held)) };
}
