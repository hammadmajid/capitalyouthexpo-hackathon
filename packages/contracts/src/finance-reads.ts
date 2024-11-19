import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { billingGraceDaysSchema } from './billing-policy.js';
import { invoiceFinancialStateSchema, invoiceTotalsSchema } from './finance-balances.js';
import { stayIdentifierSchema, stayPrivateText } from './stay-values.js';
const balanceFields = z
  .object({
    invoiceId: stayIdentifierSchema,
    invoiceNumber: stayPrivateText(64),
    currency: z.literal('PKR'),
    dueDate: databaseDateSchema,
    graceDays: billingGraceDaysSchema,
    totalPaisa: moneyJsonSchema,
    debitAdjustmentsPaisa: moneyJsonSchema,
    creditAdjustmentsPaisa: moneyJsonSchema,
    allocatedPaisa: moneyJsonSchema,
    outstandingPaisa: moneyJsonSchema,
    state: invoiceFinancialStateSchema,
    lineItems: z
      .array(
        z
          .object({
            kind: z.enum([
              'rent',
              'mess',
              'utilities',
              'admission',
              'transport',
              'custom',
              'late_fee',
            ]),
            description: stayPrivateText(500),
            amountPaisa: moneyJsonSchema,
          })
          .strict(),
      )
      .max(100)
      .optional(),
    securityDuePaisa: moneyJsonSchema.optional(),
    securityPendingPaisa: moneyJsonSchema.optional(),
  })
  .strict();
function coherent(value: z.infer<typeof balanceFields>) {
  const totals = invoiceTotalsSchema.safeParse({
    totalPaisa: value.totalPaisa,
    debitAdjustmentsPaisa: value.debitAdjustmentsPaisa,
    creditAdjustmentsPaisa: value.creditAdjustmentsPaisa,
    allocatedPaisa: value.allocatedPaisa,
  });
  if (!totals.success || !moneyJsonSchema.safeParse(value.outstandingPaisa).success) return false;
  if (
    value.lineItems &&
    value.lineItems.reduce((sum, line) => sum + BigInt(line.amountPaisa), 0n) !==
      BigInt(value.totalPaisa)
  )
    return false;
  if (
    BigInt(value.outstandingPaisa) + BigInt(value.securityDuePaisa ?? 0) >
    BigInt(Number.MAX_SAFE_INTEGER)
  )
    return false;
  const outstanding =
    BigInt(value.totalPaisa) +
    BigInt(value.debitAdjustmentsPaisa) -
    BigInt(value.creditAdjustmentsPaisa) -
    BigInt(value.allocatedPaisa);
  if (outstanding !== BigInt(value.outstandingPaisa)) return false;
  return coherentState(value.state, outstanding, value.allocatedPaisa);
}
function coherentState(
  state: z.infer<typeof invoiceFinancialStateSchema>,
  outstanding: bigint,
  allocated: number,
) {
  if (state === 'paid') return outstanding === 0n && allocated > 0;
  if (state === 'no_charge' || state === 'voided') return outstanding === 0n && allocated === 0;
  return openState(state, outstanding, allocated);
}
function openState(
  state: 'issued' | 'partially_paid' | 'overdue',
  outstanding: bigint,
  allocated: number,
) {
  if (outstanding <= 0n) return false;
  switch (state) {
    case 'issued':
      return allocated === 0;
    case 'partially_paid':
      return allocated > 0;
    case 'overdue':
      return true;
  }
}

// FIN-001 / PAY-008: producer-only DTO. Receipt-backed allocation evidence is loaded
// by the authorized repository; this schema never approves a payment proof.
export const residentInvoiceBalanceSchema = balanceFields.refine(
  coherent,
  'Inconsistent invoice financial projection',
);
export type ResidentInvoiceBalance = z.infer<typeof residentInvoiceBalanceSchema>;
export const residentInvoicePageSchema = z
  .object({
    data: z.array(residentInvoiceBalanceSchema).max(100),
    nextCursor: stayIdentifierSchema.nullable(),
  })
  .strict()
  .refine(
    (value) =>
      value.data.every((row, index) => {
        const before = value.data[index - 1]?.invoiceId;
        return before === undefined || before < row.invoiceId;
      }) &&
      (value.nextCursor === null || value.data.at(-1)?.invoiceId === value.nextCursor),
    'Invalid invoice continuation',
  );
export type ResidentInvoicePage = z.infer<typeof residentInvoicePageSchema>;
