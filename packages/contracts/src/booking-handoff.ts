import { z } from 'zod';
import { bookingQuoteSnapshotSchema } from './booking-quote.js';
import { bookingUpfrontSchema } from './booking-upfront.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
// Phase 3 → Phase 4 boundary: an authoritative, read-only view of a confirmed booking.
// It grants no admission authority and is never produced for unconfirmed bookings.
export const confirmedBookingHandoffSchema = z
  .object({
    bookingId: id,
    customerUserId: id,
    branchId: id,
    roomId: id,
    bedId: id.nullable(),
    state: z.literal('confirmed'),
    confirmedAt: z.string().datetime(),
    moveInDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    moveOutDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    policyVersionId: id,
    quote: bookingQuoteSnapshotSchema,
    documents: z.array(
      z.object({ kind: z.string(), state: z.enum(['pending', 'accepted', 'rejected']) }).strict(),
    ),
    upfront: bookingUpfrontSchema.nullable(),
    reservationClaimId: id,
    version: z.string().datetime(),
  })
  .strict()
  .refine(
    (value) => value.upfront === null || value.upfront.status === 'verified',
    'A confirmed upfront booking must carry its verified proof',
  )
  .refine(
    (value) =>
      value.quote.target.roomId === value.roomId &&
      (value.quote.target.kind === 'bed'
        ? value.quote.target.bedId === value.bedId
        : value.bedId === null),
    'Handoff target must equal the captured quote target',
  );
export type ConfirmedBookingHandoff = z.infer<typeof confirmedBookingHandoffSchema>;
