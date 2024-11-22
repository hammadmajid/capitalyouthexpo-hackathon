import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiParam, ApiResponse } from '@nestjs/swagger';
import { admissionBillingSelectionSchema, disclosedFeeSchema } from '@hsm/contracts';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object, nullable, money } from '../inventory/documentation.js';
import { billingPolicyDocumentation } from './billing-policy.documentation.js';
const kind = (value: string) => ({ type: 'string' as const, enum: [value] });
const date = { type: 'string' as const, format: 'date' };
const profile = object(
  {
    displayName: { type: 'string', minLength: 1, maxLength: 120 },
    phone: { type: 'string', pattern: '^[+][1-9][0-9]{7,14}$' },
    email: { type: 'string', format: 'email' },
    cnic: { type: 'string', pattern: '^(?:[0-9]{13}|[0-9]{5}-[0-9]{7}-[0-9])$' },
  },
  ['phone', 'email', 'cnic'],
);
const resident = {
  oneOf: [
    object({ kind: kind('new'), profile }),
    object({ kind: kind('existing'), residentId: identifier }),
  ],
};
const target = {
  oneOf: [
    object({ kind: kind('bed'), roomId: identifier, bedId: identifier }),
    object({ kind: kind('room'), roomId: identifier }),
  ],
};
const catalogue = object({
  catalogId: identifier,
  code: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
  name: { type: 'string', minLength: 1, maxLength: 120 },
  unitLabel: { type: 'string', minLength: 1, maxLength: 40 },
  unitAmountPaisa: { ...money, minimum: 1 },
});
export const manualAdmissionInputDocumentation = object(
  {
    cnicPhotoFileId: identifier,
    manual: object({
      resident,
      target,
      period: object({ moveInDate: date, expectedLeaveDate: nullable(date) }),
      terms: object({
        policyVersionId: identifier,
        currency: kind('PKR'),
        fees: {
          type: 'array',
          maxItems: 32,
          items: object({
            code: { type: 'string', enum: disclosedFeeSchema.shape.code.options },
            cadence: { type: 'string', enum: disclosedFeeSchema.shape.cadence.options },
            amountPaisa: money,
          }),
        },
        catalog: { type: 'array', maxItems: 32, items: catalogue },
        rentAmountPaisa: money,
        depositPaisa: money,
        policy: billingPolicyDocumentation,
      }),
    }),
    initialBilling: {
      type: 'array',
      minItems: 1,
      maxItems: 33,
      items: object(
        {
          item: { type: 'string', enum: admissionBillingSelectionSchema.shape.item.options },
          cadence: { type: 'string', enum: admissionBillingSelectionSchema.shape.cadence.options },
          periodIndex: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER - 1 },
          manualAmountPaisa: money,
        },
        ['manualAmountPaisa'],
      ),
    },
  },
  ['cnicPhotoFileId'],
);
export const manualAdmissionResultDocumentation = object({
  branchId: identifier,
  stayId: identifier,
  residentId: identifier,
  agreementId: identifier,
  assignmentId: identifier,
  state: kind('active'),
  version: { type: 'integer', enum: [1] },
});
export const ManualAdmissionCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiParam({ name: 'branchId', required: true, schema: identifier }),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: manualAdmissionInputDocumentation }),
    ApiResponse({ status: 201, schema: manualAdmissionResultDocumentation }),
  );
