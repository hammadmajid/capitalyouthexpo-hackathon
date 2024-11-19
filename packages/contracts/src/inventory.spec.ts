import { expect, it } from 'vitest';
import {
  roomTypeInputSchema,
  roomInputSchema,
  seatInputSchema,
  inventoryPermissionSchema,
} from './inventory.js';
import { createBookingInputSchema } from './booking-http.js';
const terms = {
  name: 'Two seats',
  capacity: 2,
  inventoryMode: 'both',
  bedMonthlyRentPaisa: 1800000,
  roomMonthlyRentPaisa: 3200000,
  depositPaisa: 0,
  fees: [],
};
it('BKG-003: both modes require explicit prices and integer paisa, with zero optional deposit', () => {
  expect(roomTypeInputSchema.parse(terms)).toEqual(terms);
  expect(
    roomTypeInputSchema.parse({ ...terms, inventoryMode: 'per_bed', roomMonthlyRentPaisa: null })
      .roomMonthlyRentPaisa,
  ).toBeNull();
  expect(
    roomTypeInputSchema.parse({ ...terms, inventoryMode: 'whole_room', bedMonthlyRentPaisa: null })
      .bedMonthlyRentPaisa,
  ).toBeNull();
});
it.each([
  { bedMonthlyRentPaisa: null },
  { roomMonthlyRentPaisa: null },
  { capacity: 0 },
  { capacity: 1.5 },
  { depositPaisa: -1 },
  { depositPaisa: 0.01 },
  { internalOwnerId: 'private' },
  { fees: [{ code: 'booking_confirmation', cadence: 'one_time', amountPaisa: 100 }] },
  {
    fees: [
      { code: 'mess', cadence: 'monthly', amountPaisa: 1 },
      { code: 'mess', cadence: 'monthly', amountPaisa: 2 },
    ],
  },
])('BKG-003/005 ACC-001: invalid inventory/pricing is rejected', (patch) => {
  expect(() => roomTypeInputSchema.parse({ ...terms, ...patch })).toThrow();
});
it('ACC-001/004: physical inventory cannot inject ordinals, branch parents or unapproved grants', () => {
  expect(() => seatInputSchema.parse({ label: 'A', status: 'active', ordinal: 2 })).toThrow();
  expect(() =>
    roomInputSchema.parse({ label: '101', status: 'paid', roomTypeId: 'invalid' }),
  ).toThrow();
  expect(() => inventoryPermissionSchema.parse('all_branches')).toThrow();
  expect(() =>
    createBookingInputSchema.parse({ quote: {}, documents: [], customerUserId: 'other' }),
  ).toThrow();
});
