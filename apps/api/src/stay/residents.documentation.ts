import { applyDecorators } from '@nestjs/common';
import { ApiQuery, type SchemaObject } from '@nestjs/swagger';
import { residentStatusSchema, staySourceSchema, stayStateSchema } from '@hsm/contracts';
import { identifier, object, nullable } from '../inventory/documentation.js';
const date: SchemaObject = { type: 'string', format: 'date' },
  instant: SchemaObject = { type: 'string', format: 'date-time' },
  status: SchemaObject = { type: 'string', enum: residentStatusSchema.options },
  state: SchemaObject = { type: 'string', enum: stayStateSchema.options };
const currentStay = nullable(
  object({
    id: identifier,
    state,
    moveInDate: date,
    roomLabel: nullable({ type: 'string' }),
    bedLabel: nullable({ type: 'string' }),
  }),
);
export const residentDirectoryDocumentation = object({
  data: {
    type: 'array',
    maxItems: 50,
    items: object({
      id: identifier,
      displayName: { type: 'string' },
      linked: { type: 'boolean' },
      status,
      currentStay,
    }),
  },
  nextCursor: nullable(identifier),
});
export const residentProfileDocumentation = object({
  id: identifier,
  branchId: identifier,
  displayName: { type: 'string' },
  contact: object({ phone: nullable({ type: 'string' }), email: nullable({ type: 'string' }) }),
  cnicLast4: nullable({ type: 'string', pattern: '^[0-9]{4}$' }),
  linked: { type: 'boolean' },
  archived: { type: 'boolean' },
  createdAt: instant,
  status,
  currentStay,
  stays: {
    type: 'array',
    maxItems: 50,
    items: object({
      id: identifier,
      source: { type: 'string', enum: staySourceSchema.options },
      state,
      moveInDate: date,
      expectedLeaveDate: nullable(date),
      closedAt: nullable(instant),
    }),
  },
  staysTruncated: { type: 'boolean' },
});
export function ResidentDirectoryQueries() {
  return applyDecorators(
    ApiQuery({
      name: 'billing',
      required: false,
      schema: { type: 'string', enum: ['due', 'overdue'] },
    }),
    ApiQuery({
      name: 'month',
      required: false,
      schema: { type: 'string', pattern: '^\\d{4}-(0[1-9]|1[0-2])$' },
    }),
    ApiQuery({ name: 'q', required: false, schema: { type: 'string', maxLength: 100 } }),
    ApiQuery({ name: 'status', required: false, schema: status }),
    ApiQuery({
      name: 'linked',
      required: false,
      schema: { type: 'string', enum: ['true', 'false'] },
    }),
    ApiQuery({
      name: 'sort',
      required: false,
      schema: { type: 'string', enum: ['name', 'newest'] },
    }),
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
    }),
  );
}

const nullableText = (format?: string) => ({
  type: 'string' as const,
  nullable: true,
  ...(format ? { format } : {}),
});
// RES-006: full replacement of the correctable fields; null clears an optional contact.
export const residentContactUpdateDocumentation = {
  type: 'object' as const,
  additionalProperties: false,
  required: ['displayName', 'phone', 'email'],
  properties: {
    displayName: { type: 'string' as const, minLength: 1, maxLength: 120 },
    phone: { ...nullableText(), pattern: '^\\+92[0-9]{10}$' },
    email: nullableText('email'),
  },
};
export const residentContactDocumentation = {
  ...residentContactUpdateDocumentation,
  required: ['id', 'branchId', 'displayName', 'phone', 'email'],
  properties: {
    id: { type: 'string' as const, format: 'uuid' },
    branchId: { type: 'string' as const, format: 'uuid' },
    ...residentContactUpdateDocumentation.properties,
  },
};
