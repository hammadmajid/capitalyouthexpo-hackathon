import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { moneyJsonSchema } from './money.js';
import { listingAmenityCodeSchema } from './listing-settings.js';
import { marketplaceSortCursorSchema, marketplaceSortSchema } from './marketplace-sort.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const marketplaceCategorySchema = z.enum([
  'boys',
  'girls',
  'working_male',
  'working_female',
]);
// CHG-033/034: every searchable place category (migration 0070).
export const placeTypeSchema = z.enum([
  'university',
  'office',
  'business_hub',
  'school',
  'health',
  'hotel',
  'food',
  'government',
  'library',
  'locality',
]);
export const marketplaceQuerySchema = z
  .object({
    ids: z
      .string()
      .max(800)
      .transform((value) => value.split(','))
      .pipe(z.array(id).min(1).max(20))
      .optional(),
    q: z.string().trim().max(120).optional(),
    cityId: id.optional(),
    areaId: id.optional(),
    universityPlaceId: id.optional(),
    // CHG-034: "Near me" or a map pin anchors the search instead of a named place.
    nearLatitude: z.coerce.number().min(-90).max(90).optional(),
    nearLongitude: z.coerce.number().min(-180).max(180).optional(),
    radiusMeters: z.coerce.number().int().min(100).max(200000).optional(),
    category: marketplaceCategorySchema.optional(),
    minimumRentPaisa: z.coerce.number().pipe(moneyJsonSchema).optional(),
    maximumRentPaisa: z.coerce.number().pipe(moneyJsonSchema).optional(),
    moveInDate: calendarDateSchema.optional(),
    moveOutDate: calendarDateSchema.optional(),
    availableOnly: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    amenities: z
      .string()
      .max(500)
      .transform((value) => value.split(',').filter(Boolean))
      .pipe(z.array(z.string().regex(/^[a-z][a-z0-9_]{1,47}$/)).max(20))
      .optional(),
    west: z.coerce.number().min(-180).max(180).optional(),
    east: z.coerce.number().min(-180).max(180).optional(),
    south: z.coerce.number().min(-90).max(90).optional(),
    north: z.coerce.number().min(-90).max(90).optional(),
    // p.13: deposit ceiling, seater size and shared-bed/whole-room option filters.
    maximumDepositPaisa: z.coerce.number().pipe(moneyJsonSchema).optional(),
    capacity: z.coerce.number().int().min(1).max(64).optional(),
    optionKind: z.enum(['bed', 'room']).optional(),
    sort: marketplaceSortSchema.optional(),
    cursor: z.union([id, marketplaceSortCursorSchema]).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.cursor !== undefined &&
      (value.sort === undefined
        ? !id.safeParse(value.cursor).success
        : !value.cursor.startsWith(value.sort + ':'))
    )
      context.addIssue({ code: 'custom', path: ['cursor'], message: 'Continuation sort changed' });
    const point = value.nearLatitude !== undefined || value.nearLongitude !== undefined;
    if (point && (value.nearLatitude === undefined || value.nearLongitude === undefined))
      context.addIssue({ code: 'custom', path: ['nearLongitude'], message: 'Choose a point' });
    if (point && value.universityPlaceId !== undefined)
      context.addIssue({ code: 'custom', path: ['nearLatitude'], message: 'Choose one anchor' });
    const anchored = point || value.universityPlaceId !== undefined;
    if (value.sort === 'nearest' && !anchored)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Choose an institution' });
    const dates = value.moveInDate !== undefined && value.moveOutDate !== undefined;
    if (
      (value.moveInDate === undefined) !== (value.moveOutDate === undefined) ||
      (value.moveInDate !== undefined &&
        value.moveOutDate !== undefined &&
        value.moveInDate >= value.moveOutDate)
    )
      context.addIssue({
        code: 'custom',
        path: ['moveOutDate'],
        message: 'Provide a valid complete stay range',
      });
    if (value.availableOnly && !dates)
      context.addIssue({ code: 'custom', path: ['availableOnly'], message: 'Choose stay dates' });
    if (value.sort === 'most_available' && !dates)
      context.addIssue({ code: 'custom', path: ['sort'], message: 'Choose stay dates' });
    if (
      value.minimumRentPaisa !== undefined &&
      value.maximumRentPaisa !== undefined &&
      value.minimumRentPaisa > value.maximumRentPaisa
    )
      context.addIssue({
        code: 'custom',
        path: ['maximumRentPaisa'],
        message: 'Invalid price range',
      });
    if (anchored !== (value.radiusMeters !== undefined))
      context.addIssue({
        code: 'custom',
        path: ['radiusMeters'],
        message: 'Choose institution and radius together',
      });
    const bounds = [value.west, value.east, value.south, value.north];
    if (
      bounds.some((item) => item !== undefined) &&
      (!bounds.every((item) => item !== undefined) ||
        !(Number(value.west) < Number(value.east) && Number(value.south) < Number(value.north)))
    )
      context.addIssue({ code: 'custom', path: ['west'], message: 'Invalid complete map bounds' });
  });
export type MarketplaceQuery = z.infer<typeof marketplaceQuerySchema>;
export const publicMediaSchema = z.object({ id, altText: z.string() }).strict();
export const listingSummarySchema = z
  .object({
    branchId: id,
    brandName: z.string(),
    name: z.string(),
    slug: z.string(),
    category: marketplaceCategorySchema,
    city: z.string(),
    area: z.string().nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    priceFromPaisa: moneyJsonSchema.nullable(),
    verified: z.literal(true),
    availableBeds: z.number().int().nonnegative().nullable(),
    availableWholeRooms: z.number().int().nonnegative().nullable(),
    amenities: z.array(z.object({ code: z.string(), name: z.string() }).strict()),
    media: z.array(publicMediaSchema).max(1),
    distanceMeters: z.number().nonnegative().nullable(),
  })
  .strict();
export const listingPageSchema = z
  .object({ data: z.array(listingSummarySchema), nextCursor: id.nullable() })
  .strict();
// Search pages continue either the stable identity order or the requested sort.
export const marketplacePageSchema = z
  .object({
    data: z.array(listingSummarySchema),
    nextCursor: z.union([id, marketplaceSortCursorSchema]).nullable(),
  })
  .strict();
export const publicRoomAmenitySchema = z
  .object({ code: listingAmenityCodeSchema, name: z.string().trim().min(1).max(80) })
  .strict();
export const publicRoomAmenityListSchema = z
  .array(publicRoomAmenitySchema)
  .max(100)
  .refine((rows) => new Set(rows.map((row) => row.code)).size === rows.length);
export const listingInventoryDetailsSchema = listingSummarySchema
  .extend({
    description: z.string().nullable(),
    address: z.string(),
    landmark: z.string().nullable(),
    publicPhone: z.string().nullable(),
    publicEmail: z.string().nullable(),
    roomTypes: z.array(
      z
        .object({
          id,
          name: z.string(),
          capacity: z.number().int().positive(),
          inventoryMode: z.enum(['per_bed', 'whole_room', 'both']),
          bedMonthlyRentPaisa: moneyJsonSchema.nullable(),
          roomMonthlyRentPaisa: moneyJsonSchema.nullable(),
          depositPaisa: moneyJsonSchema,
          amenities: publicRoomAmenityListSchema,
          rooms: z.array(
            z
              .object({
                id,
                label: z.string(),
                wholeRoomAvailable: z.boolean().nullable(),
                capacity: z.number().int().nonnegative().optional(),
                beds: z.array(
                  z
                    .object({
                      id,
                      label: z.string(),
                      available: z.boolean().nullable(),
                      monthlyRentPaisa: moneyJsonSchema.nullable().optional(),
                      depositPaisa: moneyJsonSchema.optional(),
                    })
                    .strict(),
                ),
              })
              .strict(),
          ),
        })
        .strict(),
    ),
  })
  .strict();
// P2-S1: the public detail transport contains no growing physical arrays.
// The nested shape above remains a regression reference; options use explicit pages.
export const listingDetailsSchema = listingInventoryDetailsSchema.omit({ roomTypes: true });
export const institutionPageSchema = z
  .object({
    data: z.array(
      z
        .object({
          id,
          // CHG-033: what kind of place this is, so search can label it.
          type: placeTypeSchema,
          name: z.string(),
          shortName: z.string().nullable(),
          cityId: id,
          latitude: z.number(),
          longitude: z.number(),
          hostelCount: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    nextCursor: id.nullable(),
  })
  .strict();

export const favoriteInputSchema = z.object({ saved: z.boolean() }).strict();
export const favoriteStateSchema = z.object({ branchId: id, saved: z.boolean() }).strict();
export const institutionInputSchema = z
  .object({
    // CHG-034: Admin manages every place category; older clients default to a campus.
    type: placeTypeSchema.default('university'),
    name: z.string().trim().min(2).max(180),
    shortName: z.string().trim().min(1).max(40).nullable(),
    cityId: id,
    areaId: id.nullable(),
    address: z.string().trim().min(1).max(300).nullable(),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    aliases: z
      .array(z.string().trim().min(1).max(120))
      .max(20)
      .refine((value) => new Set(value.map((alias) => alias.toLowerCase())).size === value.length),
    isActive: z.boolean(),
    publicApproved: z.boolean(),
  })
  .strict();
export const institutionStateSchema = z
  .object({ id, isActive: z.boolean(), publicApproved: z.boolean() })
  .strict();
