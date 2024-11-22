import type { SchemaObject } from '@nestjs/swagger';
import { object, identifier, nullable } from './documentation.js';
const code: SchemaObject = { type: 'string', pattern: '^[a-z][a-z0-9_]{1,47}$' };
const text = (maxLength: number) => nullable({ type: 'string', minLength: 1, maxLength });
export const listingFieldsDocumentation: Record<string, SchemaObject> = {
  description: text(4000),
  nearbyLandmark: text(1000),
  publicPhone: nullable({ type: 'string', pattern: '^\\+[1-9][0-9]{6,14}$' }),
  publicEmail: nullable({ type: 'string', format: 'email', maxLength: 254 }),
  showPublicContact: { type: 'boolean' },
};
export const listingInputDocumentation = object({
  ...listingFieldsDocumentation,
  amenityCodes: { type: 'array', maxItems: 100, uniqueItems: true, items: code },
});
export const listingReadDocumentation = object({
  ...listingFieldsDocumentation,
  branchId: identifier,
  version: { type: 'string', pattern: '^[a-f0-9]{64}$' },
  canEdit: { type: 'boolean' },
  amenities: {
    type: 'array',
    maxItems: 100,
    items: object({
      code,
      name: { type: 'string', minLength: 1, maxLength: 80 },
      isActive: { type: 'boolean' },
    }),
  },
});
export const amenityCatalogDocumentation = object({
  data: {
    type: 'array',
    maxItems: 100,
    items: object({ code, name: { type: 'string', minLength: 1, maxLength: 80 } }),
  },
  nextCursor: nullable(code),
});
