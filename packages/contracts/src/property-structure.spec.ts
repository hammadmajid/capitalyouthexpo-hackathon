import { expect, it } from 'vitest';
import {
  propertyBuildingInputSchema,
  propertyFloorInputSchema,
  propertyArchiveInputSchema,
  propertyRoomLocationInputSchema,
  propertyPageQuerySchema,
} from './property-structure.js';
const id = '10000000-0000-4000-8000-000000000001';
it('PROP / AUD-010: named hierarchy input supports exact floor levels and safe defaults', () => {
  expect(propertyBuildingInputSchema.parse({ name: ' Main building ' })).toEqual({
    name: 'Main building',
    sortOrder: 0,
  });
  expect(
    propertyFloorInputSchema.parse({ buildingId: id, label: ' Basement ', levelNumber: -1 }),
  ).toEqual({ buildingId: id, label: 'Basement', levelNumber: -1 });
  expect(propertyPageQuerySchema.parse({})).toEqual({ limit: 20, view: 'active' });
});
it.each([
  { name: '' },
  { name: 'x'.repeat(121) },
  { name: 'NUL\u0000' },
  { name: 'x', sortOrder: 0.1 },
  { name: 'x', sortOrder: 2147483648 },
  { name: 'x', canEdit: true },
])('PROP / SEC-001 / AUD-010: invalid or fabricated building fields fail (%#)', (input) => {
  expect(propertyBuildingInputSchema.safeParse(input).success).toBe(false);
});
it.each([
  { buildingId: 'foreign-looking-invalid', label: 'Ground', levelNumber: 0 },
  { buildingId: id, label: '', levelNumber: 0 },
  { buildingId: id, label: 'Ground', levelNumber: 32768 },
  { buildingId: id, label: 'Ground', levelNumber: -32769 },
  { buildingId: id, label: 'Ground', levelNumber: 0.5 },
])('PROP / SEC-001 / AUD-010: invalid parent or floor fields fail (%#)', (input) => {
  expect(propertyFloorInputSchema.safeParse(input).success).toBe(false);
});
it('ACC-004 / AUD-010: metadata writes require a version and explicit reason without invented authority', () => {
  expect(
    propertyArchiveInputSchema.parse({ expectedVersion: 1, reason: 'Archive metadata' }),
  ).toEqual({ expectedVersion: 1, reason: 'Archive metadata' });
  expect(
    propertyRoomLocationInputSchema.parse({
      expectedVersion: 1,
      reason: 'Correct physical location',
      floorId: id,
    }),
  ).toEqual({ expectedVersion: 1, reason: 'Correct physical location', floorId: id });
  for (const expectedVersion of [undefined, 0, -1, 1.5, 2147483648])
    expect(
      propertyArchiveInputSchema.safeParse({ expectedVersion, reason: 'Archive' }).success,
    ).toBe(false);
  expect(
    propertyRoomLocationInputSchema.safeParse({ expectedVersion: 1, reason: ' ', floorId: id })
      .success,
  ).toBe(false);
});
it.each([
  { limit: 0 },
  { limit: 101 },
  { limit: 'bad' },
  { cursor: 'bad' },
  { view: 'private' },
  { search: '' },
])('PROP / PERF / AUD-010: page input stays bounded and explicit (%#)', (input) => {
  expect(propertyPageQuerySchema.safeParse(input).success).toBe(false);
});
