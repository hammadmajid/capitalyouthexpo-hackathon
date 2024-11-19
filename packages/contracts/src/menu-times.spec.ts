import { expect, it } from 'vitest';
import { branchMenuSchema, menuUpdateInputSchema } from './resident-services.js';
it('CHG-037: meal times are per day and meal, 24-hour, start before end', () => {
  const ok = { dayOfWeek: 6, meal: 'dinner', startsAt: '20:00', endsAt: '22:00' };
  expect(menuUpdateInputSchema.parse({ expectedVersion: 0, items: [], times: [ok] }).times).toEqual(
    [ok],
  );
  // Omitted times mean "unchanged", so a dishes-only save keeps the Owner's meal times.
  expect(menuUpdateInputSchema.parse({ expectedVersion: 0, items: [] }).times).toBeUndefined();
  for (const bad of [
    { ...ok, startsAt: '22:00', endsAt: '20:00' },
    { ...ok, startsAt: '7:00' },
    { ...ok, dayOfWeek: 8 },
  ])
    expect(
      menuUpdateInputSchema.safeParse({ expectedVersion: 0, items: [], times: [bad] }).success,
    ).toBe(false);
  expect(
    menuUpdateInputSchema.safeParse({ expectedVersion: 0, items: [], times: [ok, ok] }).success,
  ).toBe(false);
  expect(
    branchMenuSchema.parse({
      branchId: '10000000-0000-4000-8000-000000000001',
      version: 0,
      updatedAt: null,
      items: [],
    }).times,
  ).toEqual([]);
});
