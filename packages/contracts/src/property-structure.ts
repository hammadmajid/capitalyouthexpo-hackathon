import { z } from 'zod';
import { instantSchema } from './dates.js';
import {
  stayIdentifierSchema as id,
  stayPrivateText,
  stayVersionSchema as version,
} from './stay-values.js';

export const propertyPageQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: stayPrivateText(80).optional(),
    buildingId: id.optional(),
    view: z.enum(['active', 'all']).default('active'),
  })
  .strict();
export type PropertyPageQuery = z.infer<typeof propertyPageQuerySchema>;
export const propertyBuildingInputSchema = z
  .object({
    name: stayPrivateText(120),
    sortOrder: z.number().int().min(-2147483648).max(2147483647).default(0),
  })
  .strict();
export const propertyFloorInputSchema = z
  .object({
    buildingId: id,
    label: stayPrivateText(120),
    levelNumber: z.number().int().min(-32768).max(32767),
  })
  .strict();
export const propertyArchiveInputSchema = z
  .object({
    expectedVersion: version,
    reason: stayPrivateText(500),
  })
  .strict();
export const propertyRoomLocationInputSchema = propertyArchiveInputSchema
  .extend({
    floorId: id.nullable(),
  })
  .strict();
export type PropertyBuildingInput = z.infer<typeof propertyBuildingInputSchema>;
export type PropertyFloorInput = z.infer<typeof propertyFloorInputSchema>;
export type PropertyArchiveInput = z.infer<typeof propertyArchiveInputSchema>;
export type PropertyRoomLocationInput = z.infer<typeof propertyRoomLocationInputSchema>;
export const propertyBuildingSchema = z
  .object({
    id,
    branchId: id,
    name: stayPrivateText(120),
    sortOrder: z.number().int(),
    version,
    archivedAt: instantSchema.nullable(),
  })
  .strict();
export const propertyFloorSchema = z
  .object({
    id,
    branchId: id,
    buildingId: id,
    label: stayPrivateText(120),
    levelNumber: z.number().int(),
    version,
    archivedAt: instantSchema.nullable(),
  })
  .strict();
export type PropertyBuilding = z.infer<typeof propertyBuildingSchema>;
export type PropertyFloor = z.infer<typeof propertyFloorSchema>;
export const propertyBuildingPageSchema = z
  .object({
    branchId: id,
    canEdit: z.boolean(),
    data: z.array(propertyBuildingSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict();
export const propertyFloorPageSchema = z
  .object({
    branchId: id,
    buildingId: id,
    canEdit: z.boolean(),
    data: z.array(propertyFloorSchema).max(100),
    nextCursor: id.nullable(),
  })
  .strict();
export const propertyRoomLocationSchema = z
  .object({
    branchId: id,
    roomId: id,
    roomLabel: stayPrivateText(80),
    version,
    canEdit: z.boolean(),
    archivedAt: instantSchema.nullable(),
    floor: z
      .object({
        id,
        label: stayPrivateText(120),
        buildingId: id,
        buildingName: stayPrivateText(120),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type PropertyRoomLocation = z.infer<typeof propertyRoomLocationSchema>;
