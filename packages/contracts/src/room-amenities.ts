import { z } from 'zod';
import {
  listingAmenityCodeSchema,
  listingVersionSchema,
  selectedListingAmenitySchema,
} from './listing-settings.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const roomAmenitiesInputSchema = z
  .object({
    amenityCodes: z
      .array(listingAmenityCodeSchema)
      .max(100)
      .refine((codes) => new Set(codes).size === codes.length),
  })
  .strict();
export const roomAmenitiesStateSchema = z
  .object({
    branchId: id,
    roomTypeId: id,
    version: listingVersionSchema,
    canEdit: z.boolean(),
    amenities: z
      .array(selectedListingAmenitySchema)
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.code)).size === rows.length),
  })
  .strict();
export type RoomAmenitiesInput = z.infer<typeof roomAmenitiesInputSchema>;
export type RoomAmenitiesState = z.infer<typeof roomAmenitiesStateSchema>;
// ROOM-AMN (SRS v2.15): a room either inherits its room type's amenities or keeps its own
// set (which may be empty, meaning "none"). The state always shows both for clarity.
const amenityList = z
  .array(selectedListingAmenitySchema)
  .max(100)
  .refine((rows) => new Set(rows.map((row) => row.code)).size === rows.length);
export const roomLevelAmenitiesInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('inherit') }).strict(),
  z
    .object({ mode: z.literal('custom') })
    .merge(roomAmenitiesInputSchema)
    .strict(),
]);
export const roomLevelAmenitiesStateSchema = z
  .object({
    branchId: id,
    roomId: id,
    roomTypeId: id,
    customized: z.boolean(),
    version: listingVersionSchema,
    canEdit: z.boolean(),
    amenities: amenityList,
    typeAmenities: amenityList,
  })
  .strict()
  .refine(
    (state) =>
      state.customized || JSON.stringify(state.amenities) === JSON.stringify(state.typeAmenities),
    'An inheriting room shows exactly its room-type amenities',
  );
export type RoomLevelAmenitiesInput = z.infer<typeof roomLevelAmenitiesInputSchema>;
export type RoomLevelAmenitiesState = z.infer<typeof roomLevelAmenitiesStateSchema>;
