import { expect, it } from 'vitest';
import { transportRouteInputSchema } from './resident-services.js';
import { duplicateTrips, transportTripSchema } from './transport-route.js';
const trip = (value: Record<string, unknown>) =>
  transportTripSchema.safeParse({ days: [1], effectiveFrom: '2026-07-01', ...value });
it('CHG-042: trips may be one-way, return later, or arrive after midnight when marked next day', () => {
  expect(trip({ outboundDeparts: '07:30' }).success).toBe(true);
  expect(
    trip({
      outboundDeparts: '07:30',
      outboundArrives: '08:00',
      returnDeparts: '16:00',
      returnArrives: '16:30',
    }).success,
  ).toBe(true);
  expect(trip({ outboundDeparts: '22:00', outboundArrives: '00:30' }).success).toBe(false);
  expect(
    trip({ outboundDeparts: '22:00', outboundArrives: '00:30', outboundArrivesNextDay: true })
      .success,
  ).toBe(true);
  expect(trip({ outboundDeparts: '08:00', returnDeparts: '07:00' }).success).toBe(false);
  expect(trip({ outboundDeparts: '08:00', returnArrives: '09:00' }).success).toBe(false);
  expect(trip({ outboundDeparts: '8:00' }).success).toBe(false);
  expect(
    transportTripSchema.safeParse({
      days: [1, 1],
      outboundDeparts: '08:00',
      effectiveFrom: '2026-07-01',
    }).success,
  ).toBe(false);
  expect(
    transportTripSchema.safeParse({
      days: [],
      outboundDeparts: '08:00',
      effectiveFrom: '2026-07-01',
    }).success,
  ).toBe(false);
});
it('CHG-042: two active trips leaving at the same time on the same day are duplicates', () => {
  const base = transportTripSchema.parse({
    days: [1, 2],
    outboundDeparts: '08:00',
    effectiveFrom: '2026-07-01',
  });
  expect(duplicateTrips([base, { ...base, days: [3] }])).toBe(false);
  expect(duplicateTrips([base, { ...base, days: [2] }])).toBe(true);
  expect(duplicateTrips([base, { ...base, days: [2], active: false }])).toBe(false);
});
it('CHG-042: paid routes need a price; included routes need an inclusion date and no price', () => {
  const route = { name: 'R', stops: ['A'], departureTimes: ['08:00'] };
  expect(transportRouteInputSchema.safeParse({ ...route, monthlyChargePaisa: 0 }).success).toBe(
    false,
  );
  expect(
    transportRouteInputSchema.safeParse({ ...route, monthlyChargePaisa: 400000 }).success,
  ).toBe(true);
  expect(
    transportRouteInputSchema.safeParse({
      ...route,
      monthlyChargePaisa: 0,
      pricingMode: 'included',
    }).success,
  ).toBe(false);
  expect(
    transportRouteInputSchema.safeParse({
      ...route,
      monthlyChargePaisa: 0,
      pricingMode: 'included',
      includedFrom: '2026-07-01',
    }).success,
  ).toBe(true);
  expect(
    transportRouteInputSchema.safeParse({
      ...route,
      monthlyChargePaisa: 100,
      pricingMode: 'included',
      includedFrom: '2026-07-01',
    }).success,
  ).toBe(false);
  expect(
    transportRouteInputSchema.safeParse({
      ...route,
      monthlyChargePaisa: 100,
      destinations: [
        { kind: 'area', name: 'G-10', placeId: crypto.randomUUID(), areaId: crypto.randomUUID() },
      ],
    }).success,
  ).toBe(false);
});
