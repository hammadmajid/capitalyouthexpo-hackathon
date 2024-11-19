import { expect, it } from 'vitest';
import { roomTypeInputSchema, roomTypeSummarySchema, branchInventorySchema } from './inventory.js';
const summary = {
  id: '019a1234-1234-7123-8123-123456789abc',
  branchId: '019a1234-1234-7123-8123-123456789abd',
  archivedAt: null,
  name: 'Two beds',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800000,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
};
it('BKG-003 ACC-004: persisted inventory accepts server metadata while inputs reject it', () => {
  expect(roomTypeSummarySchema.parse(summary)).toEqual(summary);
  expect(roomTypeInputSchema.safeParse(summary).success).toBe(false);
  expect(
    branchInventorySchema.parse({
      roomTypes: [summary],
      rooms: [],
      permissions: [],
      canConfigureManagers: false,
    }).roomTypes,
  ).toHaveLength(1);
});
it('BKG-003 SEC-003: output validation keeps mode-price rules and excludes private metadata', () => {
  expect(roomTypeSummarySchema.safeParse({ ...summary, bedMonthlyRentPaisa: null }).success).toBe(
    false,
  );
  expect(roomTypeSummarySchema.safeParse({ ...summary, privateOwnerId: summary.id }).success).toBe(
    false,
  );
});
