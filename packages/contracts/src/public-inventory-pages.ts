import { z } from 'zod';
import { calendarDateSchema } from './dates.js';
import { inventoryPageQuerySchema, inventoryPageSequenceIsValid } from './inventory-pages.js';
import {
  listingDetailsSchema,
  listingInventoryDetailsSchema,
  publicRoomAmenityListSchema,
} from './marketplace.js';
import { disclosedFeeListSchema } from './booking-quote.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const publicInventoryQuerySchema = inventoryPageQuerySchema
  .extend({
    moveInDate: calendarDateSchema.optional(),
    moveOutDate: calendarDateSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
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
  });
export type PublicInventoryQuery = z.infer<typeof publicInventoryQuerySchema>;
export const listingOverviewSchema = listingDetailsSchema;
// BKG-003 / BKG-005: public room types disclose every current fee before booking.
export const publicInventoryTypeSchema = listingInventoryDetailsSchema.shape.roomTypes.element
  .omit({ rooms: true })
  .extend({ fees: disclosedFeeListSchema })
  .strict();
// ROOM-003 / ROOM-004: selectable rooms and beds always carry their published photos.
const photoIds = z.array(id).min(1).max(12);
export const publicInventoryRoomSchema =
  listingInventoryDetailsSchema.shape.roomTypes.element.shape.rooms.element
    .omit({ beds: true })
    // ROOM-AMN (SRS v2.15): the room's effective amenities (own set or its room type's).
    .extend({ photoIds, amenities: publicRoomAmenityListSchema.default([]) })
    .strict();
export const publicInventoryBedSchema =
  listingInventoryDetailsSchema.shape.roomTypes.element.shape.rooms.element.shape.beds.element
    .extend({ photoIds })
    .strict();
function validPage(value: { data: { id: string }[]; nextCursor: string | null }) {
  return (
    inventoryPageSequenceIsValid(value.data) &&
    (value.nextCursor === null || value.data.at(-1)?.id === value.nextCursor)
  );
}
export const publicInventoryTypePageSchema = z
  .object({
    branchId: id,
    data: z.array(publicInventoryTypeSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Public inventory must be ordered with an exact continuation');
export const publicInventoryRoomPageSchema = z
  .object({
    branchId: id,
    roomTypeId: id,
    data: z.array(publicInventoryRoomSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Public inventory must be ordered with an exact continuation');
export const publicInventoryBedPageSchema = z
  .object({
    branchId: id,
    roomId: id,
    data: z.array(publicInventoryBedSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict()
  .refine(validPage, 'Public inventory must be ordered with an exact continuation');
