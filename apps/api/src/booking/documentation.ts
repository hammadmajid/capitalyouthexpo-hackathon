import type { SchemaObject } from '@nestjs/swagger';
import {
  object,
  identifier,
  money,
  nullable,
  feeDocumentation,
} from '../inventory/documentation.js';
import { upfrontDocumentation } from './upfront.documentation.js';
const count: SchemaObject = { type: 'integer', minimum: 0, maximum: 2147483647 };
const positive: SchemaObject = { ...count, minimum: 1 };
export const documentKind: SchemaObject = {
  type: 'string',
  enum: ['cnic', 'student_id', 'admission_proof', 'employment_proof'],
};
export const policyDocumentation = object({
  bookingMode: { type: 'string', enum: ['request', 'instant'] },
  holdSeconds: count,
  requestExpirySeconds: positive,
  requestReservesInventory: { type: 'boolean' },
  minimumStayDays: positive,
  maximumStayDays: { anyOf: [positive, { type: 'string', enum: ['unlimited'] }] },
  minimumAdvanceDays: count,
  maximumAdvanceDays: positive,
  customerSelectsInventory: { type: 'boolean' },
  cancellationAllowed: { type: 'boolean' },
  cancellationCutoffHours: count,
  allowedStayUnits: {
    type: 'array',
    minItems: 1,
    maxItems: 3,
    uniqueItems: true,
    items: { type: 'string', enum: ['day', 'week', 'month'] },
  },
  allowEvidenceReuse: { type: 'boolean' },
  documentReviewRequired: { type: 'boolean' },
  requiredDocuments: { type: 'array', uniqueItems: true, items: documentKind },
});
export const policyOverrideDocumentation: SchemaObject = object(
  Object.fromEntries(
    Object.entries(policyDocumentation.properties ?? {}).map(([key, schema]) => [
      key,
      nullable(schema as SchemaObject),
    ]),
  ),
  Object.keys(policyDocumentation.properties ?? {}),
);
export const platformLimitsDocumentation = object({
  maximumHoldSeconds: count,
  maximumActiveHolds: positive,
  maximumRequestExpirySeconds: positive,
  maximumAdvanceDays: positive,
  maximumFiniteStayDays: positive,
});
export const targetDocumentation: SchemaObject = {
  oneOf: [
    object({ kind: { type: 'string', enum: ['bed'] }, roomId: identifier, bedId: identifier }),
    object({ kind: { type: 'string', enum: ['room'] }, roomId: identifier }),
  ],
};
export const rangeDocumentation = object({
  moveInDate: { type: 'string', format: 'date' },
  moveOutDate: { type: 'string', format: 'date' },
});
export const quoteInputDocumentation = object(
  {
    target: targetDocumentation,
    range: rangeDocumentation,
    transportRequested: { type: 'boolean' },
  },
  ['transportRequested'],
);
export const quoteDocumentation = object(
  {
    version: { type: 'integer', enum: [1] },
    listing: object({
      hostelName: { type: 'string' },
      branchName: { type: 'string' },
      roomTypeName: { type: 'string' },
      roomLabel: { type: 'string' },
      bedLabel: nullable({ type: 'string' }),
    }),
    currency: { type: 'string', enum: ['PKR'] },
    ...quoteInputDocumentation.properties,
    price: object({
      monthlyRentPaisa: money,
      depositPaisa: money,
      fees: { type: 'array', maxItems: 32, items: feeDocumentation },
    }),
    policy: policyDocumentation,
    policyVersion: identifier,
    policyLineage: { type: 'array', minItems: 1, maxItems: 4, items: identifier },
    quotedAt: { type: 'string', format: 'date-time' },
    transportOffer: object({
      routeId: identifier,
      name: { type: 'string' },
      monthlyChargePaisa: money,
    }),
    includedTransport: {
      type: 'array',
      maxItems: 50,
      items: object({ id: identifier, name: { type: 'string' } }),
    },
  },
  ['includedTransport', 'transportOffer', 'transportRequested'],
);
export const holdInputDocumentation = object({ quote: quoteDocumentation });
export const holdDocumentation = object({
  id: identifier,
  branchId: identifier,
  quote: quoteDocumentation,
  expiresAt: { type: 'string', format: 'date-time' },
});
export const bookingInputDocumentation = object(
  {
    quote: quoteDocumentation,
    holdId: identifier,
    permanentAddress: {
      type: 'string',
      minLength: 5,
      maxLength: 500,
      description:
        'Private permanent address; required unless already saved on this Customer account. Never returned in booking summaries.',
    },
    cnic: { type: 'string', pattern: '^\\d{5}-?\\d{7}-?\\d$' },
    documents: {
      type: 'array',
      maxItems: 4,
      items: object({ kind: documentKind, fileId: identifier }),
    },
  },
  ['holdId', 'cnic', 'permanentAddress'],
);
export const bookingDocumentation = object(
  {
    id: identifier,
    branchId: identifier,
    reference: { type: 'string', pattern: '^HSM-[A-F0-9]{32}$' },
    state: {
      type: 'string',
      enum: ['pending_request', 'confirmed', 'rejected', 'cancelled', 'expired'],
    },
    quote: quoteDocumentation,
    createdAt: { type: 'string', format: 'date-time' },
    requestExpiresAt: nullable({ type: 'string', format: 'date-time' }),
    documents: {
      type: 'array',
      items: object({
        kind: documentKind,
        state: { type: 'string', enum: ['pending', 'accepted', 'rejected'] },
      }),
    },
    upfront: upfrontDocumentation,
    // STAY-001: the Stay created by checking in this booking, or null.
    stay: nullable(
      object({
        id: identifier,
        state: {
          type: 'string',
          enum: [
            'check_in_ready',
            'active',
            'notice_given',
            'checkout_pending',
            'completed',
            'cancelled_before_checkin',
            'terminated',
            'abandoned',
          ],
        },
      }),
    ),
  },
  ['stay'],
);
export const bookingPageDocumentation = object({
  data: { type: 'array', items: bookingDocumentation },
  nextCursor: nullable(identifier),
});
export const actionDocumentation = object({
  reason: { type: 'string', minLength: 1, maxLength: 500 },
});
