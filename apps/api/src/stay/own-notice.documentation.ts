import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiParam, ApiResponse } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object } from '../inventory/documentation.js';
const date = { type: 'string' as const, format: 'date' },
  days = { type: 'integer' as const, minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
export const ownNoticeResultDocumentation = object({
  noticeId: identifier,
  stayId: identifier,
  state: { type: 'string', enum: ['notice_given'] },
  version: { type: 'integer', minimum: 2, maximum: 2147483647 },
  plan: object({
    submittedOn: date,
    requestedCheckoutDate: date,
    earliestCompliantCheckoutDate: date,
    requiredNoticeDays: days,
    providedNoticeDays: days,
    shortfallDays: days,
    isEmergency: { type: 'boolean' },
    policyVersionId: identifier,
  }),
});
export const OwnNoticeCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiParam({ name: 'stayId', required: true, schema: identifier }),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({
      schema: object(
        {
          expectedVersion: { type: 'integer', minimum: 1, maximum: 2147483647 },
          requestedCheckoutDate: date,
          isEmergency: { type: 'boolean' },
          reason: { type: 'string', minLength: 1, maxLength: 500 },
        },
        ['reason'],
      ),
    }),
    ApiResponse({ status: 201, schema: ownNoticeResultDocumentation }),
  );
