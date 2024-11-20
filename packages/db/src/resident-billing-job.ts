import { z } from 'zod';
import { stayIdentifierSchema, stayVersionSchema } from '@hsm/contracts';

// RENT-004 / SEC-003: internal work identifies persisted facts; it never supplies money or authority.
export const RESIDENT_BILLING_EVENT = 'resident.billing.period' as const;
export const residentBillingJobSchema = z
  .object({
    scheduleId: stayIdentifierSchema,
    version: stayVersionSchema,
    periodIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();
export type ResidentBillingJob = z.infer<typeof residentBillingJobSchema>;
export function residentBillingJobKey(input: unknown): string {
  const value = residentBillingJobSchema.parse(input);
  return `resident.billing:${value.scheduleId}:v${value.version}:p${value.periodIndex}`;
}

export class InvalidResidentBillingJob extends Error {
  constructor() {
    super('INVALID_MESSAGE');
  }
}
// Persisted rows have additional envelope metadata; the financial payload remains strict.
const deliverySchema = z.object({
  id: stayIdentifierSchema,
  eventType: z.literal(RESIDENT_BILLING_EVENT),
  channel: z.literal('internal'),
  recipientUserId: z.null(),
  recipientAddress: z.null(),
  payload: residentBillingJobSchema,
  dedupeKey: z.string().min(1).max(240),
  leaseToken: stayIdentifierSchema,
  leaseExpiresAt: z.date(),
});
export type ResidentBillingDelivery = z.infer<typeof deliverySchema>;
export function parseResidentBillingDelivery(value: unknown): ResidentBillingDelivery {
  const result = deliverySchema.safeParse(value);
  if (!result.success) throw new InvalidResidentBillingJob();
  return result.data;
}
