import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiResponse } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, nullable, object, money } from '../inventory/documentation.js';
const days = { type: 'integer' as const, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const positive = { ...days, minimum: 1 };
const kind = (name: string) => ({ type: 'string' as const, enum: [name] });
const fullProration = object({ kind: kind('full_period') });
const calendarProration = object({
  kind: kind('calendar_days'),
  rounding: { type: 'string' as const, enum: ['half_up', 'down', 'up'] },
});
const manualProration = object({ kind: kind('manual') });
const proration = {
  oneOf: [
    fullProration,
    calendarProration,
    object({ kind: kind('fixed_first_period'), amountPaisa: money }),
    manualProration,
  ],
};
const monthlyCycles = {
  oneOf: [
    object({ kind: kind('calendar_month'), dueDay: { type: 'integer', minimum: 1, maximum: 31 } }),
    object({ kind: kind('anniversary_month'), dueOffsetDays: days }),
  ],
};
const transportRules = {
  dueDay: { type: 'integer' as const, minimum: 1, maximum: 31 },
  refundable: { type: 'boolean' as const },
  proration: { oneOf: [fullProration, calendarProration, manualProration] },
};
const transportFee = { ...money, minimum: 1 };
const monthlySubscription = object({ ...transportRules, monthlyChargePaisa: transportFee });
export const transportBillingDocumentation = {
  oneOf: [
    object({ offer: object({ mode: kind('included') }), monthlySubscription }, [
      'monthlySubscription',
    ]),
    object({ monthlySubscription }),
    object(
      {
        offer: object({ mode: kind('separate'), monthlyChargePaisa: transportFee }),
        ...transportRules,
      },
      ['offer'],
    ),
  ],
};
export const billingPolicyDocumentation = object(
  {
    cycle: {
      oneOf: [
        ...monthlyCycles.oneOf,
        object({ kind: kind('week'), dueOffsetDays: { type: 'integer', minimum: 0, maximum: 6 } }),
        object({ kind: kind('fixed_period'), periodDays: positive, dueOffsetDays: days }),
        object({ kind: kind('term'), dueOffsetDays: days }),
      ],
    },
    proration,
    graceDays: days,
    lateCharge: {
      oneOf: [
        object({ kind: kind('disabled') }),
        object({ kind: kind('manual') }),
        object({ kind: kind('fixed'), amountPaisa: { ...money, minimum: 1 } }),
        object({ kind: kind('percentage'), basisPoints: positive, capPaisa: nullable(money) }),
      ],
    },
    noticeDays: days,
    earlyCheckout: proration,
    allowOpenEnded: { type: 'boolean' },
    customCharges: { type: 'string', enum: ['disabled', 'catalog_only'] },
    agreementTemplate: object({
      title: { type: 'string', minLength: 1, maxLength: 120 },
      text: { type: 'string', maxLength: 12000 },
      fileId: nullable(identifier),
    }),
    transportBilling: transportBillingDocumentation,
    feeBilling: object(
      {
        oneTimeDueOffsetDays: days,
        monthly: object({
          cycle: monthlyCycles,
          proration: { oneOf: [fullProration, calendarProration, manualProration] },
        }),
      },
      ['monthly'],
    ),
  },
  ['feeBilling', 'agreementTemplate', 'transportBilling'],
);
export const billingPolicyVersionDocumentation = object({
  id: identifier,
  level: { type: 'string', enum: ['platform', 'hostel', 'branch', 'room_type'] },
  scopeId: nullable(identifier),
  policy: billingPolicyDocumentation,
  createdAt: { type: 'string', format: 'date-time' },
});
export const billingSettingsReadDocumentation = object(
  {
    target: object({ branchId: identifier, roomTypeId: identifier }, ['roomTypeId']),
    canEdit: { type: 'boolean' },
    canEditTransport: { type: 'boolean' },
    localVersion: nullable(billingPolicyVersionDocumentation),
    effectiveVersion: nullable(billingPolicyVersionDocumentation),
  },
  ['canEditTransport'],
);
export const BillingPolicyCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: object({ policy: billingPolicyDocumentation }) }),
    ApiResponse({ status: 200, schema: billingPolicyVersionDocumentation }),
  );
