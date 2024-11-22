import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, nullable, object } from '../inventory/documentation.js';
const instant = { type: 'string' as const, format: 'date-time' };
export const waitlistDocumentation = object({
  id: identifier,
  branchId: identifier,
  branchName: { type: 'string', minLength: 1, maxLength: 200 },
  roomTypeId: nullable(identifier),
  roomTypeName: nullable({ type: 'string', minLength: 1, maxLength: 120 }),
  expectedVacancyDate: nullable({ type: 'string', format: 'date' }),
  joinedAt: instant,
  leftAt: nullable(instant),
});
export function WaitlistPaging(staff = false) {
  const item = staff
    ? object({
        ...waitlistDocumentation.properties,
        customerName: { type: 'string', minLength: 1, maxLength: 200 },
      })
    : waitlistDocumentation;
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({ name: 'roomTypeId', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiResponse({
      status: 200,
      schema: object({
        data: { type: 'array', maxItems: 100, items: item },
        nextCursor: nullable(identifier),
      }),
    }),
  );
}
export function WaitlistMutation(join = false) {
  return applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ...(join
      ? [
          ApiBody({
            schema: object({ branchId: identifier, roomTypeId: identifier }, ['roomTypeId']),
          }),
        ]
      : []),
    ApiResponse({ status: 200, schema: waitlistDocumentation }),
  );
}
export const publicWaitlistOpenDocumentation = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['open', 'roomTypeIds'],
  properties: {
    open: { type: 'boolean' as const },
    roomTypeIds: {
      type: 'array' as const,
      maxItems: 100,
      items: { type: 'string' as const, format: 'uuid' },
    },
  },
};
