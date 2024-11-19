import { z } from 'zod';
import { bookingDocumentSchema } from './booking-policy.js';
import { bookingEvidenceSchema } from './booking-http.js';
const identifier = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const timestamp = z.string().datetime({ offset: true });
export const bookingDocumentSubmissionSchema = bookingEvidenceSchema
  .extend({
    shareWithOwner: z.literal(true),
  })
  .strict();
export const bookingDocumentReviewSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('accepted') }).strict(),
  z
    .object({
      state: z.literal('rejected'),
      rejectionCode: z.enum(['unreadable', 'wrong_document', 'details_mismatch', 'other']),
    })
    .strict(),
]);
const documentFields = {
  id: identifier,
  branchId: identifier,
  bookingId: identifier.nullable(),
  kind: bookingDocumentSchema,
  state: z.enum(['pending', 'accepted', 'rejected']),
  createdAt: timestamp,
  reviewedAt: timestamp.nullable(),
  rejectionCode: z.string().min(1).max(100).nullable(),
};
function reviewMetadata(
  value: { state: string; reviewedAt: string | null; rejectionCode: string | null },
  context: z.RefinementCtx,
) {
  if ((value.state === 'pending') !== (value.reviewedAt === null))
    context.addIssue({
      code: 'custom',
      path: ['reviewedAt'],
      message: 'Review timestamp must match verification state',
    });
  if ((value.state === 'rejected') !== (value.rejectionCode !== null))
    context.addIssue({
      code: 'custom',
      path: ['rejectionCode'],
      message: 'Rejection code must match verification state',
    });
}
export const ownerBookingDocumentSchema = z
  .object(documentFields)
  .strict()
  .superRefine(reviewMetadata);
export const ownBookingDocumentSchema = z
  .object({ ...documentFields, fileId: identifier, consumedAt: timestamp.nullable() })
  .strict()
  .superRefine((value, context) => {
    reviewMetadata(value, context);
    if (value.consumedAt !== null && (value.bookingId !== null || value.state === 'rejected'))
      context.addIssue({
        code: 'custom',
        path: ['consumedAt'],
        message: 'Only non-rejected standalone evidence can be consumed',
      });
  });
export const ownerBookingDocumentPageSchema = z
  .object({
    data: z.array(ownerBookingDocumentSchema).max(100),
    nextCursor: identifier.nullable(),
  })
  .strict();
export const ownBookingDocumentPageSchema = z
  .object({
    data: z.array(ownBookingDocumentSchema).max(100),
    nextCursor: identifier.nullable(),
  })
  .strict();
export type BookingDocumentSubmission = z.infer<typeof bookingDocumentSubmissionSchema>;
export type BookingDocumentReview = z.infer<typeof bookingDocumentReviewSchema>;
