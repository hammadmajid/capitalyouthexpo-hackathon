import { z } from 'zod';
import {
  billingAgreementTermsSchema,
  billingPolicyVersionSchema,
  bookingQuoteSnapshotSchema,
  databaseDateSchema,
  DomainError,
  inventoryTargetSchema,
  quoteFeeTotals,
  stayIdentifierSchema,
  type BillingPolicy,
  type BookingQuoteSnapshot,
} from '@hsm/contracts';
const contextSchema = z
  .object({
    branchId: stayIdentifierSchema,
    brandId: stayIdentifierSchema,
    roomTypeId: stayIdentifierSchema,
    policyVersionId: stayIdentifierSchema,
    target: inventoryTargetSchema,
    range: z
      .object({ moveInDate: databaseDateSchema, moveOutDate: databaseDateSchema })
      .strict()
      .refine((value) => value.moveInDate < value.moveOutDate),
  })
  .strict();
type Context = z.infer<typeof contextSchema>;
type Version = z.infer<typeof billingPolicyVersionSchema>;
function unavailable(): never {
  throw new DomainError('INTERNAL', 500, 'Booking admission data unavailable');
}
function producer<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) unavailable();
  return parsed.data;
}
function conflict(message: string): never {
  throw new DomainError('CONFLICT', 409, message);
}
function requireBookingBinding(context: Context, quote: BookingQuoteSnapshot, version: Version) {
  const scope = {
    platform: null,
    hostel: context.brandId,
    branch: context.branchId,
    room_type: context.roomTypeId,
  };
  if (
    version.scopeId !== scope[version.level] ||
    JSON.stringify(quote.target) !== JSON.stringify(context.target) ||
    quote.range.moveInDate !== context.range.moveInDate ||
    quote.range.moveOutDate !== context.range.moveOutDate
  )
    unavailable();
}
function requireBookingTiming(quote: BookingQuoteSnapshot, policy: BillingPolicy) {
  if (policy.cycle.kind !== 'calendar_month' && policy.cycle.kind !== 'anniversary_month')
    conflict('A monthly booking price requires an explicit monthly agreement');
  if (quote.price.fees.length) {
    const timing = policy.feeBilling;
    if (!timing) conflict('Configure disclosed fee timing before admission');
    if (quote.price.fees.some((fee) => fee.cadence === 'monthly') && !timing.monthly)
      conflict('Configure monthly fee timing before admission');
  }
}
// BKG-004 / RENT-003: caller loads the original persisted quote and resolved current
// non-null policy under live authorized booking/participant/inventory locks.
// Caller retains consent, complete transactional admission, audit and outbox duties.
export function snapshotBookingAdmissionTerms(
  contextValue: unknown,
  quoteValue: unknown,
  versionValue: unknown,
) {
  const context = producer(contextSchema, contextValue),
    quote = producer(bookingQuoteSnapshotSchema, quoteValue),
    version = producer(billingPolicyVersionSchema, versionValue);
  requireBookingBinding(context, quote, version);
  try {
    quoteFeeTotals(quote.price);
  } catch {
    unavailable();
  }
  if (version.id !== context.policyVersionId)
    conflict('Billing settings changed; reload the agreement policy');
  requireBookingTiming(quote, version.policy);
  return {
    bookingSnapshot: quote,
    terms: producer(billingAgreementTermsSchema, {
      policyVersionId: version.id,
      currency: quote.currency,
      fees: quote.price.fees,
      catalog: [],
      rentAmountPaisa: quote.price.monthlyRentPaisa,
      depositPaisa: quote.price.depositPaisa,
      policy: version.policy,
    }),
  };
}
