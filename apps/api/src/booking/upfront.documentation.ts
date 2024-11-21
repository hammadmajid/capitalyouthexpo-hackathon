import type { SchemaObject } from '@nestjs/swagger';
import { object, identifier, money, nullable } from '../inventory/documentation.js';
const instant: SchemaObject = { type: 'string', format: 'date-time' },
  date: SchemaObject = { type: 'string', format: 'date' },
  text = (maxLength: number): SchemaObject => ({ type: 'string', minLength: 1, maxLength }),
  method: SchemaObject = {
    type: 'string',
    enum: ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'other'],
  };
export const proofDocumentation = object({
  id: identifier,
  state: { type: 'string', enum: ['submitted', 'approved', 'rejected'] },
  amountPaisa: money,
  method,
  paidOn: date,
  reference: nullable({ type: 'string' }),
  submittedAt: instant,
  reviewedAt: nullable(instant),
  reviewReason: nullable({ type: 'string' }),
});
// SRS v2.11: Approved → Payment Pending → Verification Pending → Confirmed.
export const upfrontDocumentation = nullable(
  object({
    requirement: {
      type: 'string',
      enum: ['none', 'deposit', 'first_rent', 'deposit_and_first_rent'],
    },
    amountPaisa: { ...money, minimum: 1 },
    status: {
      type: 'string',
      enum: ['awaiting_approval', 'awaiting_payment', 'verification_pending', 'verified'],
    },
    approvedAt: nullable(instant),
    proof: nullable(proofDocumentation),
  }),
);
export const proofInputDocumentation = object({
  fileId: identifier,
  amountPaisa: { ...money, minimum: 1 },
  method,
  paidOn: date,
  reference: nullable(text(120)),
});
export const proofReviewDocumentation: SchemaObject = {
  oneOf: [
    object({ decision: { type: 'string', enum: ['approve'] } }),
    object({ decision: { type: 'string', enum: ['reject'] }, reason: text(500) }),
  ],
};
const instructionFields = {
  method,
  accountTitle: text(120),
  accountIdentifier: text(80),
  instructions: nullable(text(500)),
};
export const instructionInputDocumentation = object(instructionFields);
export const instructionDocumentation = object({
  ...instructionFields,
  id: identifier,
  branchId: identifier,
  createdAt: instant,
});
export const instructionListDocumentation = object({
  branchId: identifier,
  data: { type: 'array', maxItems: 10, items: instructionDocumentation },
});
export const upfrontSettingsDocumentation = object({
  requirement: {
    type: 'string',
    enum: ['none', 'deposit', 'first_rent', 'deposit_and_first_rent'],
  },
  proofRetryAllowed: { type: 'boolean' },
});
