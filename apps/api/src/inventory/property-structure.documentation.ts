import { object, identifier, nullable } from './documentation.js';
const version = { type: 'integer' as const, minimum: 1, maximum: 2147483647 };
const reason = { type: 'string' as const, minLength: 1, maxLength: 500 };
export const propertyBuildingInputDocumentation = object(
  {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    sortOrder: { type: 'integer', minimum: -2147483648, maximum: 2147483647, default: 0 },
  },
  ['sortOrder'],
);
export const propertyFloorInputDocumentation = object({
  buildingId: identifier,
  label: { type: 'string', minLength: 1, maxLength: 120 },
  levelNumber: { type: 'integer', minimum: -32768, maximum: 32767 },
});
export const propertyArchiveInputDocumentation = object({ expectedVersion: version, reason });
export const propertyLocationInputDocumentation = object({
  expectedVersion: version,
  reason,
  floorId: nullable(identifier),
});
export const propertyPageQueries = [
  { name: 'cursor', required: false, schema: identifier },
  {
    name: 'limit',
    required: false,
    schema: { type: 'integer' as const, minimum: 1, maximum: 100, default: 20 },
  },
  {
    name: 'search',
    required: false,
    schema: { type: 'string' as const, minLength: 1, maxLength: 80 },
  },
  { name: 'buildingId', required: false, schema: identifier },
  { name: 'view', required: false, enum: ['active', 'all'] },
] as const;
