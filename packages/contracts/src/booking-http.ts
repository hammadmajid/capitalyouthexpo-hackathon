import { z } from 'zod';
import { bookingUpfrontSchema } from './booking-upfront.js';
import { cnicSchema, permanentAddressSchema } from './identity.js';
import { inventoryTargetSchema, stayRangeSchema } from './booking-availability.js';
import { bookingDocumentSchema } from './booking-policy.js';
import { bookingQuoteSnapshotSchema } from './booking-quote.js';
import { stayStateSchema } from './stay-values.js';
import { managementPageSchema } from './management.js';
// AUD-009: same persisted pending-request scope used by dashboard action counts.
export const branchBookingPageQuerySchema = managementPageSchema.extend({
  queue: z.literal('pending_requests').optional(),
});
export type BranchBookingPageQuery = z.infer<typeof branchBookingPageQuerySchema>;
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const quoteInputSchema = z
  .object({
    target: inventoryTargetSchema,
    range: stayRangeSchema,
    transportRequested: z.boolean().optional(),
  })
  .strict();
export const holdInputSchema = z.object({ quote: bookingQuoteSnapshotSchema }).strict();
export const bookingEvidenceSchema = z.object({ kind: bookingDocumentSchema, fileId: id }).strict();
export const createBookingInputSchema = z
  .object({
    quote: bookingQuoteSnapshotSchema,
    holdId: id.optional(),
    cnic: cnicSchema.optional(),
    permanentAddress: permanentAddressSchema.optional(),
    documents: z
      .array(bookingEvidenceSchema)
      .max(4)
      .refine((value) => new Set(value.map((item) => item.kind)).size === value.length),
  })
  .strict();
export const bookingActionInputSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const bookingSummarySchema = z
  .object({
    id,
    branchId: id,
    reference: z.string().regex(/^HSM-[A-F0-9]{32}$/),
    state: z.enum(['pending_request', 'confirmed', 'rejected', 'cancelled', 'expired']),
    quote: bookingQuoteSnapshotSchema,
    createdAt: z.string().datetime(),
    requestExpiresAt: z.string().datetime().nullable(),
    documents: z.array(
      z
        .object({ kind: bookingDocumentSchema, state: z.enum(['pending', 'accepted', 'rejected']) })
        .strict(),
    ),
    // BKG-007/008: null when the request captured no upfront payment requirement.
    upfront: bookingUpfrontSchema.nullable(),
    // STAY-001 / BKG-009: the Stay created by checking in this booking. Optional so
    // idempotent replays stored before check-in visibility still parse.
    stay: z.object({ id, state: stayStateSchema }).strict().nullable().optional(),
  })
  .strict();
export const bookingPageSchema = z
  .object({ data: z.array(bookingSummarySchema), nextCursor: id.nullable() })
  .strict();
export const holdResponseSchema = z
  .object({ id, branchId: id, quote: bookingQuoteSnapshotSchema, expiresAt: z.string().datetime() })
  .strict();
export type QuoteInput = z.infer<typeof quoteInputSchema>;
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
