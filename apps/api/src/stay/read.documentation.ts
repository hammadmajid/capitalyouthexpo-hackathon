import { applyDecorators } from '@nestjs/common';
import { ApiQuery } from '@nestjs/swagger';
import { stayStateSchema, staySourceSchema } from '@hsm/contracts';
import { identifier, object, nullable } from '../inventory/documentation.js';
const date = { type: 'string' as const, format: 'date' },
  instant = { type: 'string' as const, format: 'date-time' };
export const staySummaryDocumentation = object({
  id: identifier,
  branchId: identifier,
  residentId: identifier,
  displayName: { type: 'string', minLength: 1, maxLength: 120 },
  source: { type: 'string', enum: staySourceSchema.options },
  state: { type: 'string', enum: stayStateSchema.options },
  version: { type: 'integer', minimum: 1, maximum: 2147483647 },
  moveInDate: date,
  expectedLeaveDate: nullable(date),
  checkedInAt: nullable(instant),
  closedAt: nullable(instant),
  currentAssignment: nullable(
    object({
      id: identifier,
      roomTypeId: identifier,
      roomId: identifier,
      bedId: nullable(identifier),
      startedAt: instant,
    }),
  ),
});
export const stayPageDocumentation = object({
  data: { type: 'array', maxItems: 100, items: staySummaryDocumentation },
  nextCursor: nullable(identifier),
});
export const stayDetailDocumentation = object({
  ...staySummaryDocumentation.properties,
  bookingId: nullable(identifier),
  contact: object({
    phone: nullable({ type: 'string', pattern: '^[+][1-9][0-9]{7,14}$' }),
    email: nullable({ type: 'string', format: 'email', maxLength: 254 }),
  }),
});
export const StayPageQueries = () =>
  applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({
      name: 'state',
      required: false,
      schema: { type: 'string', enum: stayStateSchema.options },
    }),
  );
export const StaffStayQueries = () =>
  applyDecorators(
    StayPageQueries(),
    ApiQuery({
      name: 'q',
      required: false,
      schema: { type: 'string', minLength: 1, maxLength: 100 },
    }),
    ...['roomId', 'bedId'].map((name) => ApiQuery({ name, required: false, schema: identifier })),
    ...['moveInFrom', 'moveInTo', 'expectedLeaveFrom', 'expectedLeaveTo'].map((name) =>
      ApiQuery({ name, required: false, schema: date }),
    ),
  );
