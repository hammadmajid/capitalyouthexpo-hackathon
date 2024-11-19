import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import {
  roomPriceInputSchema,
  roomPriceQuerySchema,
  roomPriceVersionSchema,
  roomPriceHistorySchema,
} from './inventory-pricing.js';
const input = {
  effectiveFrom: '2026-10-25',
  bedMonthlyRentPaisa: 1800001,
  roomMonthlyRentPaisa: null,
  depositPaisa: 0,
  fees: [],
};
it('BKG-004: price versions require an explicit real calendar date and integer paisa', () => {
  expect(roomPriceInputSchema.parse(input)).toEqual(input);
  for (const patch of [
    { effectiveFrom: undefined },
    { effectiveFrom: '2026-02-30' },
    { depositPaisa: 0.1 },
    { bedMonthlyRentPaisa: -1 },
    { extra: true },
    { fees: [{ code: 'arbitrary', cadence: 'monthly', amountPaisa: 1 }] },
  ])
    expect(roomPriceInputSchema.safeParse({ ...input, ...patch }).success).toBe(false);
});
it('BKG-004: explicit no deposit and zero fees are retained; duplicate categories/frequencies fail', () => {
  const fee = { code: 'mess', cadence: 'monthly', amountPaisa: 0 };
  expect(roomPriceInputSchema.parse({ ...input, fees: [fee] }).fees[0]?.amountPaisa).toBe(0);
  expect(roomPriceInputSchema.safeParse({ ...input, fees: [fee, fee] }).success).toBe(false);
  expect(
    roomPriceInputSchema.safeParse({ ...input, fees: [fee, { ...fee, cadence: 'one_time' }] })
      .success,
  ).toBe(true);
});
it('ACC-004: price history has scoped identities and bounded cursor pagination', () => {
  expect(roomPriceQuerySchema.parse({})).toEqual({ limit: 20 });
  expect(roomPriceQuerySchema.parse({ limit: '100', cursor: '2026-10-25' })).toEqual({
    limit: 100,
    cursor: '2026-10-25',
  });
  for (const query of [{ limit: 0 }, { limit: 101 }, { cursor: 'tomorrow' }, { unexpected: true }])
    expect(roomPriceQuerySchema.safeParse(query).success).toBe(false);
  const version = {
    ...input,
    id: randomUUID(),
    branchId: randomUUID(),
    roomTypeId: randomUUID(),
    createdAt: '2026-10-25T10:00:00.000Z',
  };
  expect(roomPriceVersionSchema.parse(version)).toEqual(version);
  expect(
    roomPriceHistorySchema.parse({
      branchId: version.branchId,
      roomTypeId: version.roomTypeId,
      data: [version],
      nextCursor: null,
    }).data,
  ).toEqual([version]);
});
