import { agreementTemplateSchema } from './agreement-documents.js';
import { billingCatalogSnapshotsSchema } from './billing-catalog.js';
import { z } from 'zod';
import { moneyJsonSchema } from './money.js';
import { disclosedFeeSchema, priceTermsSchema } from './booking-quote.js';
import { stayIdentifierSchema } from './stay-values.js';
import { transportOfferSchema } from './transport-route.js';
import {
  billingCycleSchema,
  recurringFeeProrationSchema,
  rentProrationSchema,
} from './billing-values.js';
import { feeBillingPolicySchema } from './fee-billing-policy.js';
export { billingCycleSchema, rentProrationSchema } from './billing-values.js';
const days = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
export const billingGraceDaysSchema = days;
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const lateChargePolicySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('disabled') }).strict(),
  z.object({ kind: z.literal('manual') }).strict(),
  z.object({ kind: z.literal('fixed'), amountPaisa: moneyJsonSchema.gt(0) }).strict(),
  z
    .object({
      kind: z.literal('percentage'),
      basisPoints: positive,
      capPaisa: moneyJsonSchema.nullable(),
    })
    .strict(),
]);
// SERV-002: branch transport rules travel with the captured agreement.
const transportBillingRules = z.object({
  dueDay: z.number().int().min(1).max(31),
  refundable: z.boolean(),
  proration: recurringFeeProrationSchema,
});
export const transportMonthlySubscriptionSchema = transportBillingRules
  .extend({ monthlyChargePaisa: moneyJsonSchema.gt(0) })
  .strict();
export type TransportMonthlySubscription = z.infer<typeof transportMonthlySubscriptionSchema>;

export const transportBillingPolicySchema = z.union([
  z
    .object({
      offer: transportOfferSchema.options[0],
      monthlySubscription: transportMonthlySubscriptionSchema.optional(),
    })
    .strict(),
  z
    .object({
      offer: z.never().optional(),
      monthlySubscription: transportMonthlySubscriptionSchema,
    })
    .strict(),
  transportBillingRules.extend({ offer: transportOfferSchema.options[1].optional() }).strict(),
]);
export type TransportBillingPolicy = z.infer<typeof transportBillingPolicySchema>;

export function configuredTransportSubscription(policy: TransportBillingPolicy | undefined) {
  if (!policy) return undefined;
  if (!('dueDay' in policy)) return policy.monthlySubscription;
  const { offer, ...rules } = policy;
  return offer ? { ...rules, monthlyChargePaisa: offer.monthlyChargePaisa } : undefined;
}

export function separateTransportPolicy(subscription: TransportMonthlySubscription) {
  const { monthlyChargePaisa, ...rules } = subscription;
  return { ...rules, offer: { mode: 'separate' as const, monthlyChargePaisa } };
}
export const transportBillingPolicyInputSchema = z
  .object({
    policyVersionId: stayIdentifierSchema,
    transportBilling: transportBillingPolicySchema,
  })
  .strict();
export type TransportBillingPolicyInput = z.infer<typeof transportBillingPolicyInputSchema>;
// RENT-001/003, FIN-001/002: no inferred financial defaults; resolve and snapshot first.
export const billingPolicySchema = z
  .object({
    cycle: billingCycleSchema,
    proration: rentProrationSchema,
    graceDays: billingGraceDaysSchema,
    lateCharge: lateChargePolicySchema,
    noticeDays: days,
    earlyCheckout: rentProrationSchema,
    allowOpenEnded: z.boolean(),
    customCharges: z.enum(['disabled', 'catalog_only']),
    feeBilling: feeBillingPolicySchema.optional(),
    transportBilling: transportBillingPolicySchema.optional(),
    agreementTemplate: agreementTemplateSchema.optional(),
  })
  .strict();
export type BillingPolicy = z.infer<typeof billingPolicySchema>;
export const billingAgreementTermsSchema = z
  .object({
    policyVersionId: stayIdentifierSchema,
    currency: z.literal('PKR'),
    fees: z.array(disclosedFeeSchema).max(32),
    catalog: billingCatalogSnapshotsSchema,
    rentAmountPaisa: moneyJsonSchema,
    depositPaisa: moneyJsonSchema,
    policy: billingPolicySchema,
  })
  .strict()
  .refine(
    (value) =>
      priceTermsSchema.safeParse({
        monthlyRentPaisa: value.rentAmountPaisa,
        depositPaisa: value.depositPaisa,
        fees: value.fees,
      }).success,
    'Invalid disclosed price terms',
  )
  .refine(
    (value) => value.policy.customCharges !== 'disabled' || value.catalog.length === 0,
    'Disabled custom charges cannot carry catalog fees',
  );
export type BillingAgreementTerms = z.infer<typeof billingAgreementTermsSchema>;
