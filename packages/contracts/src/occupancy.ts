import { z } from 'zod';
import { databaseDateSchema } from './database-dates.js';
import { inventoryStatusSchema } from './inventory.js';
import { inventoryPageQuerySchema } from './inventory-pages.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
// BED-001: occupancy on one calendar date (Asia/Karachi). The server defaults to today.
export const occupancyQuerySchema = inventoryPageQuerySchema
  .extend({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    on: databaseDateSchema.optional(),
    // P5-M4: narrow the listed rooms and beds; totals always describe the whole branch.
    roomTypeId: id.optional(),
    roomId: id.optional(),
    state: z.enum(['occupied', 'blocked', 'reserved', 'unavailable', 'available']).optional(),
  })
  .strict();
export type OccupancyQuery = z.infer<typeof occupancyQuerySchema>;
// BED-001 / STAY-001: only an active assignment is occupancy; a booking or hold is a
// reservation and never counts as an occupied bed. Precedence: occupied > blocked >
// reserved > unavailable (inactive, maintenance or archived inventory) > available.
export const bedOccupancyStateSchema = z.enum([
  'occupied',
  'blocked',
  'reserved',
  'unavailable',
  'available',
]);
export type BedOccupancyState = z.infer<typeof bedOccupancyStateSchema>;
// RENT-004 / PAY-008 (CHG-048): the occupant's rent from server invoice balances only.
// overdue: an invoice is past due and grace; due: an invoice that has reached its due date
// (or is part paid) still has a balance, matching the Rent Board (Q5);
// paid: nothing open and at least one receipt-backed paid invoice; clear: nothing billed
// or owed yet. Only "paid" may be shown as green; a proof alone never makes a bed paid.
// proof_pending: a resident proof waits for review (Q5 action needed); never "paid".
export const occupancyRentStatusSchema = z.enum([
  'clear',
  'paid',
  'due',
  'overdue',
  'proof_pending',
]);
export type OccupancyRentStatus = z.infer<typeof occupancyRentStatusSchema>;
export const occupancyBedSchema = z
  .object({
    id,
    label: z.string(),
    ordinal: z.number().int().positive(),
    status: inventoryStatusSchema,
    state: bedOccupancyStateSchema,
    // Financial status is available only to finance_view holders, for current occupancy.
    rentStatus: occupancyRentStatusSchema.nullable().optional(),
    // RES-004: exact resident-to-bed mapping, returned only to stay_manage holders.
    occupant: z.object({ stayId: id, displayName: z.string() }).strict().nullable(),
  })
  .strict()
  .refine((bed) => (bed.state === 'occupied') === (bed.occupant !== null), 'Invalid occupant')
  .refine(
    (bed) => bed.rentStatus == null || bed.state === 'occupied',
    'Rent status requires occupancy',
  );
// Physical place of a room for grouping the Bed Board; null when the room has no floor yet.
export const occupancyBuildingSchema = z.object({ id, name: z.string() }).strict();
export const occupancyFloorSchema = z
  .object({ id, label: z.string(), levelNumber: z.number().int() })
  .strict();
export const occupancyRoomSchema = z
  .object({
    id,
    label: z.string(),
    roomTypeId: id,
    status: inventoryStatusSchema,
    building: occupancyBuildingSchema.nullable().optional(),
    floor: occupancyFloorSchema.nullable().optional(),
    beds: z.array(occupancyBedSchema),
  })
  .strict();
export const occupancyTotalsSchema = z
  .object({
    beds: z.number().int().nonnegative(),
    occupied: z.number().int().nonnegative(),
    blocked: z.number().int().nonnegative(),
    reserved: z.number().int().nonnegative(),
    unavailable: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (totals) =>
      totals.beds ===
      totals.occupied + totals.blocked + totals.reserved + totals.unavailable + totals.available,
    'Occupancy totals do not add up',
  );
export type OccupancyTotals = z.infer<typeof occupancyTotalsSchema>;
export const occupancyPageSchema = z
  .object({
    branchId: id,
    on: databaseDateSchema,
    totals: occupancyTotalsSchema,
    data: z.array(occupancyRoomSchema),
    nextCursor: id.nullable(),
  })
  .strict();
export type OccupancyPage = z.infer<typeof occupancyPageSchema>;
export const bedOccupancyQuerySchema = z.object({ on: databaseDateSchema.optional() }).strict();
// BED-002: one bed on one date with every live claim that covers it. Bookings and holds
// are listed as reservations with their own reference, never as occupancy.
export const bedOccupancyClaimSchema = z
  .object({
    source: z.enum(['assignment', 'block', 'booking', 'hold']),
    bookingId: id.nullable(),
    stayId: id.nullable(),
    moveInDate: databaseDateSchema,
    moveOutDate: databaseDateSchema.nullable(),
    wholeRoom: z.boolean(),
  })
  .strict();
export const bedLocationSchema = z
  .object({
    hostel: z.object({ id, name: z.string() }).strict(),
    branch: z.object({ id, name: z.string() }).strict(),
    building: z.object({ id, name: z.string() }).strict().nullable(),
    floor: z.object({ id, label: z.string(), levelNumber: z.number().int() }).strict().nullable(),
  })
  .strict();
export const bedOccupancySchema = z
  .object({
    branchId: id,
    on: databaseDateSchema,
    room: z
      .object({
        id,
        label: z.string(),
        roomTypeId: id,
        roomTypeName: z.string(),
        status: inventoryStatusSchema,
      })
      .strict(),
    bed: occupancyBedSchema,
    location: bedLocationSchema.optional(),
    claims: z.array(bedOccupancyClaimSchema).max(50),
    // BED-002: live claims that start after the date (confirmed bookings, holds, planned
    // moves), earliest first, so staff see who is coming next to this bed.
    upcoming: z.array(bedOccupancyClaimSchema).max(20).optional(),
  })
  .strict();
export type BedOccupancy = z.infer<typeof bedOccupancySchema>;
