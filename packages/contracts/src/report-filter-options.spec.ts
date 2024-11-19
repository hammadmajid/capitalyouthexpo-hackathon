import { expect, it } from 'vitest';
import { reportOptionPageSchema, reportOptionQuerySchema } from './report-filter-options.js';
const id = '10000000-0000-4000-8000-000000000001';
it('RPT-001 / AUD-010: named lookup defaults stay bounded and preserve literal search text', () => {
  expect(reportOptionQuerySchema.parse({ field: 'building', search: '  %_  ' })).toEqual({
    field: 'building',
    search: '%_',
    limit: 20,
  });
  expect(
    reportOptionQuerySchema.parse({ field: 'floor', buildingId: id, limit: '100' }).limit,
  ).toBe(100);
  expect(reportOptionQuerySchema.parse({ field: 'room', floorId: id }).floorId).toBe(id);
});
it.each([
  {},
  { field: 'unknown' },
  { field: 'floor' },
  { field: 'floor', buildingId: id, floorId: id },
  { field: 'building', buildingId: id },
  { field: 'resident', floorId: id },
  { field: 'room', cursor: 'bad' },
  { field: 'room', limit: 0 },
  { field: 'room', limit: 101 },
  { field: 'resident', search: 'x'.repeat(81) },
  { field: 'room', residentId: id },
])('SEC-003 / RPT-001 / AUD-010: invalid/inapplicable named-option scope rejects: %o', (input) => {
  expect(reportOptionQuerySchema.safeParse(input).success).toBe(false);
});
it('SEC-003 / AUD-010: option responses contain exact scope and names without resident profile fields', () => {
  const page = {
    branchId: id,
    type: 'residents',
    field: 'resident',
    buildingId: null,
    floorId: null,
    data: [{ id, name: 'Synthetic resident', detail: null, archived: false }],
    nextCursor: null,
  };
  expect(reportOptionPageSchema.parse(page)).toEqual(page);
  expect(
    reportOptionPageSchema.safeParse({ ...page, data: [{ ...page.data[0], phone: 'private' }] })
      .success,
  ).toBe(false);
  expect(
    reportOptionPageSchema.safeParse({
      ...page,
      data: Array.from({ length: 101 }, () => page.data[0]),
    }).success,
  ).toBe(false);
});
