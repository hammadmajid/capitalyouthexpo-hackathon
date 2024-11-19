import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { publicRoomAmenityListSchema } from './marketplace.js';
import { publicInventoryTypeSchema } from './public-inventory-pages.js';
it('ROOM-002 / ACC-002: genuine empty and actual named public room amenities normalize without private metadata', () => {
  expect(publicRoomAmenityListSchema.parse([])).toEqual([]);
  expect(publicRoomAmenityListSchema.parse([{ code: 'wifi', name: ' Wi-Fi ' }])).toEqual([
    { code: 'wifi', name: 'Wi-Fi' },
  ]);
});
it.each([
  { rows: [{ code: 'wifi', name: 'Wi-Fi', isActive: true }] },
  { rows: [{ code: 'wifi', name: 'Wi-Fi', occupantId: randomUUID() }] },
  { rows: [{ code: 'WiFi', name: 'Wi-Fi' }] },
  { rows: [{ code: 'wifi', name: '' }] },
  {
    rows: [
      { code: 'wifi', name: 'Wi-Fi' },
      { code: 'wifi', name: 'Wi-Fi' },
    ],
  },
  { rows: Array.from({ length: 101 }, (_, i) => ({ code: 'code_' + i, name: 'Catalog amenity' })) },
])('ROOM-002 / SEC-003: rejects invalid public amenity collection %#', ({ rows }) => {
  expect(publicRoomAmenityListSchema.safeParse(rows).success).toBe(false);
});
it('ROOM-002: public room options require actual explicit amenity data rather than defaulting an omitted collection', () => {
  const schema = publicInventoryTypeSchema;
  const room = {
    id: randomUUID(),
    name: 'Two beds',
    capacity: 2,
    inventoryMode: 'per_bed',
    bedMonthlyRentPaisa: 1800000,
    roomMonthlyRentPaisa: null,
    depositPaisa: 0,
    fees: [],
  };
  expect(schema.safeParse(room).success).toBe(false);
  expect(schema.parse({ ...room, amenities: [] }).amenities).toEqual([]);
  expect(schema.parse({ ...room, amenities: [{ code: 'wifi', name: 'Wi-Fi' }] }).amenities).toEqual(
    [{ code: 'wifi', name: 'Wi-Fi' }],
  );
});
