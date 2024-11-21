import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiQuery, ApiResponse, type SchemaObject } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { problemDocumentation } from '../auth/problem.documentation.js';
import { identifier, nullable, object } from './documentation.js';
const inputFields = {
  body: { type: 'string', minLength: 1, maxLength: 4000 },
  sortOrder: { type: 'integer', minimum: 0, maximum: 2147483647 },
} satisfies Record<string, SchemaObject>;
export const listingRuleInputDocumentation = object(inputFields);
export const publicListingRuleDocumentation = object({ id: identifier, ...inputFields });
const privateFields = {
  ...inputFields,
  id: identifier,
  branchId: identifier,
  version: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
  archivedAt: nullable({ type: 'string', format: 'date-time' }),
} satisfies Record<string, SchemaObject>;
export const privateListingRuleDocumentation = object(privateFields);
export const listingRuleStateDocumentation = object({
  ...privateFields,
  canEdit: { type: 'boolean' },
});
export const listingRuleArchiveDocumentation = object({
  reason: { type: 'string', minLength: 1, maxLength: 500 },
});
const cursor: SchemaObject = {
  type: 'string',
  minLength: 38,
  maxLength: 47,
  description: 'Last returned sort order and canonical UUID',
};
export const publicListingRulesPageDocumentation = object({
  branchId: identifier,
  data: { type: 'array', maxItems: 100, items: publicListingRuleDocumentation },
  nextCursor: nullable(cursor),
});
export const privateListingRulesPageDocumentation = object({
  branchId: identifier,
  state: { type: 'string', enum: ['active', 'archived'] },
  canEdit: { type: 'boolean' },
  data: { type: 'array', maxItems: 100, items: privateListingRuleDocumentation },
  nextCursor: nullable(cursor),
});
export function ListingRulesPaging(history = false) {
  return applyDecorators(
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({ name: 'cursor', required: false, schema: cursor }),
    ...(history
      ? [
          ApiQuery({
            name: 'state',
            required: false,
            schema: { type: 'string', enum: ['active', 'archived'], default: 'active' },
          }),
        ]
      : []),
  );
}
export function ListingRuleCommand(schema: SchemaObject, status: 200 | 201 = 200, version = true) {
  return applyDecorators(
    CookieCsrf(),
    ApiBody({ schema }),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ...(version
      ? [
          ApiHeader({
            name: 'If-Match',
            required: true,
            schema: { type: 'string', pattern: '^"[a-f0-9]{64}"$' },
          }),
        ]
      : []),
    ApiResponse({
      status,
      schema: listingRuleStateDocumentation,
      headers: { ETag: { schema: { type: 'string' } } },
    }),
    ApiResponse({
      status: 412,
      description: 'PRECONDITION_FAILED: refresh changed listing rules.',
      content: { 'application/problem+json': { schema: problemDocumentation } },
    }),
  );
}
