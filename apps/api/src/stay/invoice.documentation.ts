import { invoiceFinancialStateSchema } from '@hsm/contracts';
import { object, identifier, nullable } from '../inventory/documentation.js';
const paisa = { type: 'integer' as const, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const invoiceBalanceDocumentation = object(
  {
    invoiceId: identifier,
    invoiceNumber: { type: 'string', minLength: 1, maxLength: 64 },
    currency: { type: 'string', enum: ['PKR'] },
    dueDate: { type: 'string', format: 'date' },
    graceDays: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
    totalPaisa: paisa,
    debitAdjustmentsPaisa: paisa,
    creditAdjustmentsPaisa: paisa,
    allocatedPaisa: paisa,
    outstandingPaisa: paisa,
    lineItems: {
      type: 'array',
      maxItems: 100,
      items: object({
        kind: {
          type: 'string',
          enum: ['rent', 'mess', 'utilities', 'admission', 'transport', 'custom', 'late_fee'],
        },
        description: { type: 'string', minLength: 1, maxLength: 500 },
        amountPaisa: paisa,
      }),
    },
    securityDuePaisa: paisa,
    securityPendingPaisa: paisa,
    state: { type: 'string', enum: invoiceFinancialStateSchema.options },
  },
  ['lineItems', 'securityDuePaisa', 'securityPendingPaisa'],
);

export const invoiceReferencePageDocumentation = object({
  branchId: identifier,
  stayId: identifier,
  data: {
    type: 'array',
    maxItems: 100,
    items: object(
      {
        invoiceId: identifier,
        invoiceNumber: { type: 'string', minLength: 1, maxLength: 64 },
        dueDate: { type: 'string', format: 'date' },
        issuedAt: { type: 'string', format: 'date-time' },
        documentState: { type: 'string', enum: ['issued', 'voided'] },
        kind: {
          type: 'string',
          enum: [
            'rent',
            'mess',
            'utilities',
            'admission',
            'custom',
            'late_fee',
            'transport',
            'mixed',
          ],
        },
      },
      ['kind'],
    ),
  },
  nextCursor: nullable(identifier),
});
