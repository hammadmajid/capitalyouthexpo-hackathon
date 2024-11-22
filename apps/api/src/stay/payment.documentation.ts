import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { externalPaymentMethodSchema } from '@hsm/contracts';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object, money } from '../inventory/documentation.js';
const positive = { ...money, minimum: 1 };
export const paymentInputDocumentation = object(
  {
    amountPaisa: positive,
    method: { type: 'string', enum: externalPaymentMethodSchema.options },
    transactionReference: { type: 'string', minLength: 1, maxLength: 160 },
    proofFileId: identifier,
    paidOn: { type: 'string', format: 'date' },
    note: { type: 'string', minLength: 1, maxLength: 500 },
    allocations: {
      type: 'array',
      maxItems: 100,
      items: object({ invoiceId: identifier, amountPaisa: positive }),
    },
    depositPaisa: money,
    advanceCreditPaisa: money,
  },
  ['transactionReference', 'proofFileId'],
);
export const recordedPaymentDocumentation = object({
  paymentId: identifier,
  receiptId: identifier,
  receiptNumber: { type: 'string', minLength: 1, maxLength: 64 },
  amountPaisa: positive,
});
export const RecordedPaymentCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: paymentInputDocumentation }),
    ApiResponse({ status: 201, schema: recordedPaymentDocumentation }),
  );
