import { z } from 'zod';
import { bookingPolicySchema } from './booking-policy.js';
import { stayRangeSchema, inventoryTargetSchema } from './booking-availability.js';
import { addMoney, money, moneyFromJson, moneyJsonSchema, moneyToJson } from './money.js';
export const disclosedFeeSchema = z
  .object({
    code: z.enum(['mess', 'utilities', 'admission']),
    cadence: z.enum(['monthly', 'one_time']),
    amountPaisa: moneyJsonSchema,
  })
  .strict();
export const disclosedFeeListSchema = z
  .array(disclosedFeeSchema)
  .max(32)
  .refine(
    (fees) => new Set(fees.map((fee) => fee.code + ':' + fee.cadence)).size === fees.length,
    'Duplicate fee category and cadence',
  );
export const priceTermsSchema = z
  .object({
    monthlyRentPaisa: moneyJsonSchema,
    depositPaisa: moneyJsonSchema,
    fees: z.array(disclosedFeeSchema).max(32),
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.fees.map((fee) => fee.code + ':' + fee.cadence)).size === value.fees.length,
    'Duplicate fee category and cadence',
  );
export const bookingQuoteSnapshotSchema = z
  .object({
    version: z.literal(1),
    listing: z
      .object({
        hostelName: z.string(),
        branchName: z.string(),
        roomTypeName: z.string(),
        roomLabel: z.string(),
        bedLabel: z.string().nullable(),
      })
      .strict(),
    currency: z.literal('PKR'),
    target: inventoryTargetSchema,
    range: stayRangeSchema,
    price: priceTermsSchema,
    policy: bookingPolicySchema,
    policyVersion: z.string().uuid(),
    policyLineage: z.array(z.string().uuid()).min(1).max(4),
    quotedAt: z.string().datetime(),
    transportRequested: z.boolean().optional(),
    transportOffer: z
      .object({ routeId: z.string().uuid(), name: z.string(), monthlyChargePaisa: moneyJsonSchema })
      .strict()
      .optional(),
    includedTransport: z
      .array(z.object({ id: z.string().uuid(), name: z.string() }).strict())
      .max(50)
      .optional(),
  })
  .strict();
export type BookingQuoteSnapshot = z.infer<typeof bookingQuoteSnapshotSchema>;
// BKG-004: clone/validate terms, never retain a live Owner settings object.
export function snapshotBookingQuote(input: unknown): BookingQuoteSnapshot {
  return bookingQuoteSnapshotSchema.parse(input);
}
// Quote terms, not a prorated rent invoice; Q3 remains a later finance decision.
export function quoteFeeTotals(input: unknown) {
  const price = priceTermsSchema.parse(input);
  let monthly = moneyFromJson(price.monthlyRentPaisa);
  let oneTime = money(0n);
  for (const fee of price.fees) {
    const value = moneyFromJson(fee.amountPaisa);
    if (fee.cadence === 'monthly') monthly = addMoney(monthly, value);
    else oneTime = addMoney(oneTime, value);
  }
  return {
    monthlyTotalPaisa: moneyToJson(monthly),
    oneTimeTotalPaisa: moneyToJson(oneTime),
    depositPaisa: price.depositPaisa,
  };
}
