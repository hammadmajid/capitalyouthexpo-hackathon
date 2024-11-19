import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema as id, stayPrivateText } from './stay-values.js';
// CHG-042 / SRS v2.30: richer transport — typed destinations, pickup/drop-off stops, weekly
// trips with optional return and next-day times, and included-in-rent pricing.
const text = stayPrivateText;
export const transportClock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
export const transportPricingModeSchema = z.enum(['separate', 'included']);
export const transportOfferSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('included') }).strict(),
  z.object({ mode: z.literal('separate'), monthlyChargePaisa: moneyJsonSchema.gt(0) }).strict(),
]);
export const transportDestinationKindSchema = z.enum(['university', 'office', 'area', 'other']);
export const transportDestinationSchema = z
  .object({
    kind: transportDestinationKindSchema,
    name: text(120),
    // Catalog place (university/office/locality) or area; null for a named custom destination.
    placeId: id.nullable().default(null),
    areaId: id.nullable().default(null),
  })
  .strict()
  .refine((value) => !(value.placeId && value.areaId), 'Choose a place or an area, not both');
export const transportStopRoleSchema = z.enum(['both', 'pickup', 'dropoff']);
export const transportStopSchema = z
  .object({ name: text(120), role: transportStopRoleSchema.default('both') })
  .strict();
// 1 = Monday .. 7 = Sunday (Asia/Karachi wall clock).
export const transportDaySchema = z.number().int().min(1).max(7);
export const transportTripSchema = z
  .object({
    days: z.array(transportDaySchema).min(1).max(7),
    outboundDeparts: transportClock,
    outboundArrives: transportClock.nullable().default(null),
    outboundArrivesNextDay: z.boolean().default(false),
    // Null means one-way: no return journey is offered for this trip.
    returnDeparts: transportClock.nullable().default(null),
    returnDepartsNextDay: z.boolean().default(false),
    returnArrives: transportClock.nullable().default(null),
    returnArrivesNextDay: z.boolean().default(false),
    effectiveFrom: databaseDateSchema,
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((trip, context) => {
    if (new Set(trip.days).size !== trip.days.length)
      context.addIssue({ code: 'custom', message: 'Each day appears once', path: ['days'] });
    if (!trip.returnDeparts && trip.returnArrives)
      context.addIssue({
        code: 'custom',
        message: 'A return arrival needs a return departure',
        path: ['returnArrives'],
      });
    const order = tripMoments(trip);
    for (let index = 1; index < order.length; index += 1)
      if ((order[index]?.at ?? 0) <= (order[index - 1]?.at ?? 0))
        context.addIssue({
          code: 'custom',
          message: 'Times must run in order; mark a time as next day when it is after midnight',
          path: [order[index]?.field ?? 'outboundDeparts'],
        });
  });
export type TransportTrip = z.infer<typeof transportTripSchema>;
// Response shapes: exact stored values, no defaults.
export const transportDestinationViewSchema = z
  .object({
    kind: transportDestinationKindSchema,
    name: z.string(),
    placeId: id.nullable(),
    areaId: id.nullable(),
  })
  .strict();
export const transportStopViewSchema = z
  .object({ name: z.string(), role: transportStopRoleSchema })
  .strict();
export const transportTripViewSchema = z
  .object({
    days: z.array(transportDaySchema).max(7),
    outboundDeparts: z.string(),
    outboundArrives: z.string().nullable(),
    outboundArrivesNextDay: z.boolean(),
    returnDeparts: z.string().nullable(),
    returnDepartsNextDay: z.boolean(),
    returnArrives: z.string().nullable(),
    returnArrivesNextDay: z.boolean(),
    effectiveFrom: databaseDateSchema,
    active: z.boolean(),
  })
  .strict();
const minutes = (clock: string, nextDay: boolean) => {
  const [hour = 0, minute = 0] = clock.split(':').map(Number);
  return hour * 60 + minute + (nextDay ? 1440 : 0);
};
// The configured journey moments in minutes from the departure day's midnight.
export function tripMoments(trip: {
  outboundDeparts: string;
  outboundArrives: string | null;
  outboundArrivesNextDay: boolean;
  returnDeparts: string | null;
  returnDepartsNextDay: boolean;
  returnArrives: string | null;
  returnArrivesNextDay: boolean;
}) {
  const moments: { field: string; at: number }[] = [
    { field: 'outboundDeparts', at: minutes(trip.outboundDeparts, false) },
  ];
  if (trip.outboundArrives)
    moments.push({
      field: 'outboundArrives',
      at: minutes(trip.outboundArrives, trip.outboundArrivesNextDay),
    });
  if (trip.returnDeparts)
    moments.push({
      field: 'returnDeparts',
      at: minutes(trip.returnDeparts, trip.returnDepartsNextDay),
    });
  if (trip.returnArrives)
    moments.push({
      field: 'returnArrives',
      at: minutes(trip.returnArrives, trip.returnArrivesNextDay),
    });
  return moments;
}
// Two active trips on a shared day with the same outbound departure are duplicates.
export function duplicateTrips(trips: TransportTrip[]) {
  const seen = new Set<string>();
  for (const trip of trips.filter((value) => value.active))
    for (const day of trip.days) {
      const key = day + '@' + trip.outboundDeparts;
      if (seen.has(key)) return true;
      seen.add(key);
    }
  return false;
}
export const transportRouteDetailsSchema = z.object({
  pricingMode: transportPricingModeSchema.default('separate'),
  // Included-in-rent applies to Stay agreements effective on or after this date (no silent
  // entitlement for earlier agreements).
  includedFrom: databaseDateSchema.nullable().default(null),
  destinations: z.array(transportDestinationSchema).max(20).default([]),
  stopPoints: z.array(transportStopSchema).max(30).default([]),
  trips: z.array(transportTripSchema).max(24).default([]),
});
export const transportRouteDetailsRefinement = (
  value: {
    pricingMode: 'separate' | 'included';
    includedFrom: string | null;
    monthlyChargePaisa?: number | undefined;
    trips: TransportTrip[];
  },
  context: z.RefinementCtx,
) => {
  if (value.pricingMode === 'separate' && value.monthlyChargePaisa === 0)
    context.addIssue({
      code: 'custom',
      message: 'Enter the monthly charge',
      path: ['monthlyChargePaisa'],
    });
  if (
    value.pricingMode === 'included' &&
    value.monthlyChargePaisa !== undefined &&
    value.monthlyChargePaisa !== 0
  )
    context.addIssue({
      code: 'custom',
      message: 'Included transport has no separate charge',
      path: ['monthlyChargePaisa'],
    });
  if (value.pricingMode === 'included' && !value.includedFrom)
    context.addIssue({
      code: 'custom',
      message: 'Choose when inclusion in rent starts',
      path: ['includedFrom'],
    });
  if (value.pricingMode === 'separate' && value.includedFrom)
    context.addIssue({ code: 'custom', message: 'Only included transport has an inclusion date' });
  if (duplicateTrips(value.trips))
    context.addIssue({
      code: 'custom',
      message: 'Two trips leave at the same time on the same day',
      path: ['trips'],
    });
};
export const transportOverviewSchema = z
  .object({
    branchId: id,
    activeRoutes: z.number().int().nonnegative(),
    inactiveRoutes: z.number().int().nonnegative(),
    destinations: z.number().int().nonnegative(),
    includedRoutes: z.number().int().nonnegative(),
    paidRoutes: z.number().int().nonnegative(),
    activeSubscribers: z.number().int().nonnegative(),
    pendingRequests: z.number().int().nonnegative(),
    // Sum of active separately charged subscriptions' agreed monthly charges.
    monthlyChargesPaisa: moneyJsonSchema.nullable(),
    tripsToday: z.number().int().nonnegative(),
  })
  .strict();
export type TransportOverview = z.infer<typeof transportOverviewSchema>;
export type TransportDestination = z.infer<typeof transportDestinationSchema>;
export type TransportStop = z.infer<typeof transportStopSchema>;
