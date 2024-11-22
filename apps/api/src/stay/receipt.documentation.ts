import { externalPaymentMethodSchema } from '@hsm/contracts';
import { object, identifier, money, nullable } from '../inventory/documentation.js';
const positive = { ...money, minimum: 1 };
const date = { type: 'string' as const, format: 'date' },
  instant = { type: 'string' as const, format: 'date-time' };
const name = { type: 'string' as const, minLength: 1, maxLength: 120 };
export const receiptDetailDocumentation = object({
  receiptId: identifier,
  receiptNumber: { type: 'string', minLength: 1, maxLength: 64 },
  issuedAt: instant,
  reversed: { type: 'boolean' },
  snapshot: object({
    version: { type: 'integer', enum: [1] },
    currency: { type: 'string', enum: ['PKR'] },
    paymentId: identifier,
    branchId: identifier,
    stayId: identifier,
    residentName: name,
    hostelName: name,
    branchName: name,
    amountPaisa: positive,
    method: { type: 'string', enum: externalPaymentMethodSchema.options },
    transactionReference: nullable({ type: 'string', minLength: 1, maxLength: 160 }),
    paidOn: date,
    approvedAt: instant,
    allocations: {
      type: 'array',
      maxItems: 100,
      items: object({
        invoiceId: identifier,
        invoiceNumber: { type: 'string', minLength: 1, maxLength: 64 },
        amountPaisa: positive,
      }),
    },
    distribution: object({ allocatedPaisa: money, depositPaisa: money, advanceCreditPaisa: money }),
  }),
});
