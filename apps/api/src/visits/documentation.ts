import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import type { SchemaObject } from '@nestjs/swagger';
import { visitStatusSchema, visitHistoryActionSchema } from '@hsm/contracts';
import { identifier, nullable, object } from '../inventory/documentation.js';
import { CookieCsrf } from '../auth/response.documentation.js';
const instant: SchemaObject = { type: 'string', format: 'date-time' };
const reason: SchemaObject = { type: 'string', minLength: 1, maxLength: 500 };
const window = object({
  dayOfWeek: { type: 'integer', minimum: 0, maximum: 6 },
  opensAt: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
  closesAt: { type: 'string', pattern: '^(?:[01]\\d|2[0-3]):[0-5]\\d$' },
});
const windows: SchemaObject = { type: 'array', maxItems: 100, items: window };
const version: SchemaObject = { type: 'string', pattern: '^[a-f0-9]{64}$' };
export const visitDocumentation = object({
  id: identifier,
  branchId: identifier,
  status: { type: 'string', enum: [...visitStatusSchema.options] },
  requestedStart: instant,
  proposedStart: nullable(instant),
  reason: nullable(reason),
  createdAt: instant,
  updatedAt: instant,
});
export const visitPageDocumentation = object({
  data: {
    type: 'array',
    maxItems: 100,
    items: object({
      ...visitDocumentation.properties,
      branchName: { type: 'string', minLength: 1, maxLength: 200 },
      customerName: { type: 'string', minLength: 1, maxLength: 200 },
    }),
  },
  nextCursor: nullable(identifier),
});
export const hoursDocumentation = object({ branchId: identifier, version, windows });
export const hoursInputDocumentation = object({ expectedVersion: version, windows });
export const slotsDocumentation = object({
  branchId: identifier,
  date: { type: 'string', format: 'date' },
  windows,
});
export const createVisitDocumentation = object({ branchId: identifier, requestedStart: instant });
const basicAction = (action: string) => object({ action: { type: 'string', enum: [action] } });
export const visitActionDocumentation = object({
  expectedUpdatedAt: instant,
  command: {
    oneOf: [
      ...['approve', 'cancel', 'accept-reschedule', 'complete', 'no-show'].map(basicAction),
      object(
        { action: { type: 'string', enum: ['reschedule'] }, proposedStart: instant, note: reason },
        ['note'],
      ),
      object({ action: { type: 'string', enum: ['reject'] }, reason }),
    ],
  },
});
export function VisitMutation(
  input: SchemaObject,
  output: SchemaObject = visitDocumentation,
  status = 200,
) {
  return applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: input }),
    ApiResponse({ status, schema: output }),
  );
}
export function VisitPaging() {
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'date', required: false, schema: { type: 'string', format: 'date' } }),
    ApiQuery({ name: 'status', required: false, enum: visitStatusSchema.options }),
    ApiResponse({ status: 200, schema: visitPageDocumentation }),
  );
}

export const visitHistoryDocumentation = object({
  visitId: identifier,
  branchId: identifier,
  branchName: { type: 'string', minLength: 1, maxLength: 200 },
  customerName: { type: 'string', minLength: 1, maxLength: 200 },
  data: {
    type: 'array',
    maxItems: 100,
    items: object({
      id: identifier,
      action: { type: 'string', enum: [...visitHistoryActionSchema.options] },
      status: { type: 'string', enum: [...visitStatusSchema.options] },
      requestedStart: instant,
      proposedStart: nullable(instant),
      reason: nullable(reason),
      createdAt: instant,
    }),
  },
  nextCursor: nullable(identifier),
});
export function VisitHistoryPaging() {
  return applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiResponse({ status: 200, schema: visitHistoryDocumentation }),
  );
}
export const visitInterestDocumentation = object({
  visitId: identifier,
  branchId: identifier,
  expectedUpdatedAt: instant,
  promptedAt: nullable(instant),
  stillInterested: nullable({ type: 'boolean' }),
  respondedAt: nullable(instant),
});
export const visitInterestInputDocumentation = object({
  expectedUpdatedAt: instant,
  stillInterested: { type: 'boolean' },
});
