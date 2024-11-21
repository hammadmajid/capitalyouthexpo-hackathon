import { applyDecorators } from '@nestjs/common';
import { ApiHeader, ApiQuery } from '@nestjs/swagger';
import { bookingDocumentSchema } from '@hsm/contracts';
import { object, identifier, nullable } from '../inventory/documentation.js';
const timestamp = { type: 'string' as const, format: 'date-time' };
const kind = { type: 'string' as const, enum: [...bookingDocumentSchema.options] };
const fields = {
  id: identifier,
  branchId: identifier,
  bookingId: nullable(identifier),
  kind,
  state: { type: 'string' as const, enum: ['pending', 'accepted', 'rejected'] },
  createdAt: timestamp,
  reviewedAt: nullable(timestamp),
  rejectionCode: nullable({ type: 'string' as const, maxLength: 100 }),
};
export const ownerDocumentDocumentation = object(fields);
export const ownDocumentDocumentation = object({
  ...fields,
  fileId: identifier,
  consumedAt: nullable(timestamp),
});
export const ownerDocumentPageDocumentation = object({
  data: { type: 'array', maxItems: 100, items: ownerDocumentDocumentation },
  nextCursor: nullable(identifier),
});
export const ownDocumentPageDocumentation = object({
  data: { type: 'array', maxItems: 100, items: ownDocumentDocumentation },
  nextCursor: nullable(identifier),
});
export const documentSubmissionDocumentation = object({
  kind,
  fileId: identifier,
  shareWithOwner: { type: 'boolean', enum: [true] },
});
export const documentReviewDocumentation = {
  oneOf: [
    object({ state: { type: 'string', enum: ['accepted'] } }),
    object({
      state: { type: 'string', enum: ['rejected'] },
      rejectionCode: {
        type: 'string',
        enum: ['unreadable', 'wrong_document', 'details_mismatch', 'other'],
      },
    }),
  ],
};
export const DocumentPageQuery = () =>
  applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: { type: 'string', format: 'uuid' } }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100 },
    }),
  );
export const DocumentIdempotency = () =>
  ApiHeader({
    name: 'Idempotency-Key',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  });
