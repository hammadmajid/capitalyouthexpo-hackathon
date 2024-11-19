import { z } from 'zod';
import { DomainError } from './errors.js';
export const inventoryModeSchema = z.enum(['per_bed', 'whole_room', 'both']);
export const bookingModeSchema = z.enum(['request', 'instant']);
// CHG-007: closed approved catalog; CNIC may be absent, privacy never optional.
export const bookingDocumentSchema = z.enum([
  'cnic',
  'student_id',
  'admission_proof',
  'employment_proof',
]);
const count = z.number().int().nonnegative().max(2147483647);
const positive = count.min(1);
const fields = {
  bookingMode: bookingModeSchema,
  holdSeconds: count,
  requestExpirySeconds: positive,
  requestReservesInventory: z.boolean(),
  minimumStayDays: positive,
  maximumStayDays: z.union([positive, z.literal('unlimited')]),
  minimumAdvanceDays: count,
  maximumAdvanceDays: positive,
  customerSelectsInventory: z.boolean(),
  cancellationAllowed: z.boolean(),
  cancellationCutoffHours: count,
  allowedStayUnits: z
    .array(z.enum(['day', 'week', 'month']))
    .min(1)
    .max(3)
    .refine((value) => new Set(value).size === value.length),
  allowEvidenceReuse: z.boolean(),
  documentReviewRequired: z.boolean(),
  requiredDocuments: z
    .array(bookingDocumentSchema)
    .refine((value) => new Set(value).size === value.length),
};
export const bookingPolicySchema = z
  .object(fields)
  .strict()
  .superRefine((value, context) => {
    if (value.maximumStayDays !== 'unlimited' && value.maximumStayDays < value.minimumStayDays)
      context.addIssue({
        code: 'custom',
        path: ['maximumStayDays'],
        message: 'Maximum stay precedes minimum stay',
      });
    if (value.maximumAdvanceDays < value.minimumAdvanceDays)
      context.addIssue({
        code: 'custom',
        path: ['maximumAdvanceDays'],
        message: 'Maximum advance precedes minimum advance',
      });
  });
export const bookingPolicyOverrideSchema = z
  .object({
    bookingMode: fields.bookingMode.nullable().optional(),
    holdSeconds: fields.holdSeconds.nullable().optional(),
    requestExpirySeconds: fields.requestExpirySeconds.nullable().optional(),
    requestReservesInventory: fields.requestReservesInventory.nullable().optional(),
    minimumStayDays: fields.minimumStayDays.nullable().optional(),
    maximumStayDays: fields.maximumStayDays.nullable().optional(),
    minimumAdvanceDays: fields.minimumAdvanceDays.nullable().optional(),
    maximumAdvanceDays: fields.maximumAdvanceDays.nullable().optional(),
    customerSelectsInventory: fields.customerSelectsInventory.nullable().optional(),
    cancellationAllowed: fields.cancellationAllowed.nullable().optional(),
    cancellationCutoffHours: fields.cancellationCutoffHours.nullable().optional(),
    allowedStayUnits: fields.allowedStayUnits.nullable().optional(),
    allowEvidenceReuse: fields.allowEvidenceReuse.nullable().optional(),
    documentReviewRequired: fields.documentReviewRequired.nullable().optional(),
    requiredDocuments: fields.requiredDocuments.nullable().optional(),
  })
  .strict();
export const bookingPlatformLimitsSchema = z
  .object({
    maximumHoldSeconds: count,
    maximumActiveHolds: positive,
    maximumRequestExpirySeconds: positive,
    maximumAdvanceDays: positive,
    maximumFiniteStayDays: positive,
  })
  .strict();
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;
export type BookingPolicyOverride = z.infer<typeof bookingPolicyOverrideSchema>;
// BKG-006: platform bounds are explicit inputs, not silently guessed from examples.
export function resolveBookingPolicy(
  defaults: unknown,
  layers: readonly unknown[],
  limits: unknown,
): BookingPolicy {
  let result = bookingPolicySchema.parse(defaults);
  const bounds = bookingPlatformLimitsSchema.parse(limits);
  for (const layer of layers) {
    const override = bookingPolicyOverrideSchema.parse(layer);
    const inherited = Object.fromEntries(
      Object.entries(override).filter(([, value]) => value !== null && value !== undefined),
    );
    result = bookingPolicySchema.parse({ ...result, ...inherited });
  }
  if (
    result.holdSeconds > bounds.maximumHoldSeconds ||
    result.requestExpirySeconds > bounds.maximumRequestExpirySeconds ||
    result.maximumAdvanceDays > bounds.maximumAdvanceDays ||
    (result.maximumStayDays !== 'unlimited' &&
      result.maximumStayDays > bounds.maximumFiniteStayDays)
  )
    throw new DomainError('VALIDATION_FAILED', 422, 'Booking policy exceeds platform limits');
  return result;
}
