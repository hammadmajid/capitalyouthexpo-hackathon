import { z } from 'zod';
import { instantSchema } from './dates.js';
import { databaseDateSchema } from './database-dates.js';
import { moneyJsonSchema } from './money.js';
import { stayIdentifierSchema as id, stayPrivateText, stayVersionSchema } from './stay-values.js';
import {
  transportClock,
  transportDestinationViewSchema,
  transportOfferSchema,
  transportPricingModeSchema,
  transportRouteDetailsRefinement,
  transportRouteDetailsSchema,
  transportStopViewSchema,
  transportTripViewSchema,
} from './transport-route.js';
const text = stayPrivateText;
// SERV-001: a day-wise weekly menu (1 = Monday .. 7 = Sunday). Version 0 = not configured.
export const mealSchema = z.enum(['breakfast', 'lunch', 'dinner']);
export const menuCellSchema = z
  .object({ dayOfWeek: z.number().int().min(1).max(7), meal: mealSchema, description: text(200) })
  .strict();
const cells = z
  .array(menuCellSchema)
  .max(21)
  .refine(
    (value) => new Set(value.map((cell) => cell.dayOfWeek + ':' + cell.meal)).size === value.length,
    'Each day and meal appears once',
  );
// CHG-037: when each meal is served per day (weekdays/weekends may differ), 24-hour "HH:MM".
const mealClock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM (24-hour)');
export const mealTimeSchema = z
  .object({
    dayOfWeek: z.number().int().min(1).max(7),
    meal: mealSchema,
    startsAt: mealClock,
    endsAt: mealClock,
  })
  .strict()
  .refine((value) => value.startsAt < value.endsAt, 'Start before end');
const times = z
  .array(mealTimeSchema)
  .max(21)
  .refine(
    (value) => new Set(value.map((t) => t.dayOfWeek + ':' + t.meal)).size === value.length,
    'One time per day and meal',
  );
export const branchMenuSchema = z
  .object({
    branchId: id,
    version: z.number().int().nonnegative(),
    updatedAt: instantSchema.nullable(),
    items: cells,
    times: times.default([]),
  })
  .strict();
export type BranchMenu = z.infer<typeof branchMenuSchema>;
export const menuUpdateInputSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    items: cells,
    // CHG-037: omitted means "keep the current meal times"; a client that only edits dishes
    // must never wipe the times the Owner set in Setup.
    times: times.optional(),
  })
  .strict();
// SERV-002: optional hostel-run transport with its own visible monthly charge.
// CHG-042: legacy `departureTimes`/`stops` stay accepted; when trips or stop points are given
// the server derives them, so older clients and readers keep working.
const routeFields = z
  .object({
    name: text(120),
    description: text(500).optional(),
    monthlyChargePaisa: moneyJsonSchema.nonnegative().optional(),
    departureTimes: z.array(transportClock).max(12).default([]),
    stops: z.array(text(120)).max(30).default([]),
  })
  .merge(transportRouteDetailsSchema)
  .strict();
export const transportRouteInputSchema = routeFields
  .extend({ status: z.enum(['active', 'inactive']).optional() })
  .superRefine(transportRouteDetailsRefinement);
export const transportRouteUpdateSchema = routeFields
  .extend({ expectedVersion: stayVersionSchema, status: z.enum(['active', 'inactive']) })
  .strict()
  .superRefine(transportRouteDetailsRefinement);
export const transportRouteSchema = z
  .object({
    id,
    branchId: id,
    name: z.string(),
    description: z.string().nullable(),
    monthlyChargePaisa: moneyJsonSchema,
    departureTimes: z.array(z.string()).max(12),
    stops: z.array(z.string()).max(30),
    status: z.enum(['active', 'inactive']),
    version: z.number().int().positive(),
    pricingMode: transportPricingModeSchema,
    includedFrom: databaseDateSchema.nullable(),
    destinations: z.array(transportDestinationViewSchema).max(20),
    stopPoints: z.array(transportStopViewSchema).max(30),
    trips: z.array(transportTripViewSchema).max(24),
    // Resident view only: whether this resident's current agreement includes the route.
    residentInclusion: z.enum(['included', 'not_in_agreement']).nullable().optional(),
  })
  .strict();
export type TransportRoute = z.infer<typeof transportRouteSchema>;
export const transportRouteListSchema = z
  .object({
    branchId: id,
    data: z.array(transportRouteSchema).max(50),
    offer: transportOfferSchema.nullable().optional(),
  })
  .strict();
export const transportSubscriptionStatusSchema = z.enum([
  'requested',
  'active',
  'ended',
  'rejected',
  'withdrawn',
]);
export const transportSubscriptionSchema = z
  .object({
    id,
    branchId: id,
    stayId: id,
    routeId: id,
    routeName: z.string(),
    residentName: z.string().min(1).max(120).optional(),
    billing: z
      .object({
        invoiceId: id,
        dueDate: databaseDateSchema,
        outstandingPaisa: moneyJsonSchema,
        state: z.enum(['due', 'overdue', 'paid', 'cleared']),
      })
      .strict()
      .nullable()
      .optional(),
    status: transportSubscriptionStatusSchema,
    monthlyChargePaisa: moneyJsonSchema,
    effectiveFrom: databaseDateSchema.nullable(),
    effectiveTo: databaseDateSchema.nullable(),
    endRequestedAt: instantSchema.nullable(),
    reason: z.string().nullable(),
    version: z.number().int().positive(),
    createdAt: instantSchema,
  })
  .strict();
export type TransportSubscription = z.infer<typeof transportSubscriptionSchema>;
export const transportSubscriptionPageSchema = z
  .object({ data: z.array(transportSubscriptionSchema).max(50), nextCursor: id.nullable() })
  .strict();
export function transportInvoiceState(
  input: { state: string; outstandingPaisa: number; dueDate: string },
  today: string,
) {
  if (input.state === 'paid') return 'paid';
  if (input.outstandingPaisa === 0) return 'cleared';
  return today > input.dueDate ? 'overdue' : 'due';
}
export const transportSubscriptionQuerySchema = z
  .object({
    status: transportSubscriptionStatusSchema.optional(),
    // Staff list only: one Stay's subscriptions (e.g. the resident on a Bed Board bed).
    stayId: id.optional(),
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
// The resident confirms the exact monthly charge they were shown (transparent consent).
export const transportRequestInputSchema = z
  .object({ routeId: id.optional(), monthlyChargePaisa: moneyJsonSchema.gt(0) })
  .strict();
export const transportResidentActionSchema = z
  .object({ expectedVersion: stayVersionSchema })
  .strict();
export const transportDecisionInputSchema = z.discriminatedUnion('decision', [
  z
    .object({
      decision: z.literal('approve'),
      expectedVersion: stayVersionSchema,
      effectiveFrom: databaseDateSchema,
    })
    .strict(),
  z
    .object({
      decision: z.literal('reject'),
      expectedVersion: stayVersionSchema,
      reason: text(500),
    })
    .strict(),
  z
    .object({
      decision: z.literal('end'),
      expectedVersion: stayVersionSchema,
      effectiveTo: databaseDateSchema,
    })
    .strict(),
]);
