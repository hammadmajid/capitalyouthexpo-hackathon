import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiHeader, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { CookieCsrf } from '../auth/response.documentation.js';
import { identifier, object, nullable, money } from '../inventory/documentation.js';
export const catalogInputDocumentation = object({
  code: { type: 'string', pattern: '^[a-z][a-z0-9_]{0,63}$' },
  name: { type: 'string', minLength: 1, maxLength: 120 },
  unitLabel: { type: 'string', minLength: 1, maxLength: 40 },
  unitAmountPaisa: { ...money, minimum: 1 },
});
const instant = { type: 'string' as const, format: 'date-time' };
export const catalogEntryDocumentation = object({
  ...catalogInputDocumentation.properties,
  id: identifier,
  branchId: identifier,
  createdAt: instant,
  archivedAt: nullable(instant),
});
export const catalogPageDocumentation = object({
  branchId: identifier,
  canEdit: { type: 'boolean' },
  includeArchived: { type: 'boolean' },
  data: { type: 'array', maxItems: 100, items: catalogEntryDocumentation },
  nextCursor: nullable(identifier),
});
export const CatalogQueries = () =>
  applyDecorators(
    ApiQuery({ name: 'cursor', required: false, schema: identifier }),
    ApiQuery({
      name: 'limit',
      required: false,
      schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
    }),
    ApiQuery({
      name: 'includeArchived',
      required: false,
      schema: { type: 'string', enum: ['true', 'false'] },
    }),
  );
export const CatalogCreateCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: catalogInputDocumentation }),
    ApiResponse({ status: 201, schema: catalogEntryDocumentation }),
  );
export const CatalogArchiveCommand = () =>
  applyDecorators(
    CookieCsrf(),
    ApiHeader({ name: 'Idempotency-Key', required: true, schema: identifier }),
    ApiBody({ schema: object({ reason: { type: 'string', minLength: 1, maxLength: 500 } }) }),
    ApiResponse({ status: 200, schema: catalogEntryDocumentation }),
  );
