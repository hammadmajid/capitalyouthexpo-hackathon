import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { roomAmenitiesInputSchema, roomAmenitiesStateSchema } from './room-amenities.js';
const branchId = randomUUID(),
  roomTypeId = randomUUID();
it('ROOM-002 / ACC-002: room amenities are an explicit independent catalog selection', () => {
  expect(roomAmenitiesInputSchema.parse({ amenityCodes: [] })).toEqual({ amenityCodes: [] });
  expect(roomAmenitiesInputSchema.parse({ amenityCodes: ['wifi', 'attached_bathroom'] })).toEqual({
    amenityCodes: ['wifi', 'attached_bathroom'],
  });
});
it.each([
  {},
  { amenityCodes: ['wifi', 'wifi'] },
  { amenityCodes: ['WiFi'] },
  { amenityCodes: ['wifi'], bedMonthlyRentPaisa: 0 },
  { amenityCodes: Array.from({ length: 101 }, (_, i) => 'code_' + i) },
])('ROOM-002 / ACC-004: rejects missing, uncontrolled or mixed room amenity input %#', (input) => {
  expect(roomAmenitiesInputSchema.safeParse(input).success).toBe(false);
});
it('ROOM-002 / ACC-004: private room amenity state carries exact scope, version and current edit authority', () => {
  expect(
    roomAmenitiesStateSchema.parse({
      branchId: branchId.toUpperCase(),
      roomTypeId,
      version: 'a'.repeat(64),
      canEdit: false,
      amenities: [{ code: 'wifi', name: 'Wi-Fi', isActive: true }],
    }),
  ).toMatchObject({ branchId, roomTypeId, canEdit: false });
});
it.each([
  { branchId, roomTypeId, version: 'bad', canEdit: true, amenities: [] },
  { branchId, roomTypeId, version: 'a'.repeat(64), amenities: [] },
  {
    branchId,
    roomTypeId,
    version: 'a'.repeat(64),
    canEdit: true,
    amenities: [],
    customerId: randomUUID(),
  },
  {
    branchId,
    roomTypeId,
    version: 'a'.repeat(64),
    canEdit: true,
    amenities: [
      { code: 'wifi', name: 'Wi-Fi', isActive: true },
      { code: 'wifi', name: 'Wi-Fi', isActive: true },
    ],
  },
])('ACC-004: rejects invalid or overbroad room amenity state %#', (input) => {
  expect(roomAmenitiesStateSchema.safeParse(input).success).toBe(false);
});
