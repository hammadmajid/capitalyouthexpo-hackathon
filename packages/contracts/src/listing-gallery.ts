import { z } from 'zod';
import { fileStatusSchema } from './files.js';
import { listingVersionSchema } from './listing-settings.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
export const galleryFieldsSchema = z
  .object({
    altText: z.string().trim().min(1).max(240),
    sortOrder: z.number().int().min(0).max(2147483647),
  })
  .strict();
// ROOM-002/003: absent target means a hostel photo; bed photos always name their room.
export const galleryTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('room'), roomId: id }).strict(),
  z.object({ kind: z.literal('bed'), roomId: id, bedId: id }).strict(),
]);
export const galleryAttachSchema = galleryFieldsSchema
  .extend({ fileId: id, target: galleryTargetSchema.optional() })
  .strict();
export const galleryEditSchema = galleryFieldsSchema.extend({ published: z.boolean() }).strict();
export const galleryArchiveSchema = z
  .object({ reason: z.string().trim().min(1).max(500) })
  .strict();
export const galleryQuerySchema = z
  .object({
    cursor: id.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    state: z.enum(['active', 'archived', 'all']).default('active'),
    roomId: id.optional(),
    bedId: id.optional(),
  })
  .strict()
  .refine((query) => !query.bedId || query.roomId, {
    message: 'A bed filter requires its room',
    path: ['roomId'],
  });
export const galleryMediaSchema = galleryFieldsSchema
  .extend({
    id,
    branchId: id,
    fileId: id,
    roomId: id.nullable(),
    bedId: id.nullable(),
    publishedAt: z.string().datetime().nullable(),
    archivedAt: z.string().datetime().nullable(),
    scanStatus: fileStatusSchema,
    version: listingVersionSchema,
  })
  .strict();
export const galleryPageSchema = z
  .object({
    data: z.array(galleryMediaSchema).max(100),
    nextCursor: id.nullable(),
    canEdit: z.boolean(),
    canPublish: z.boolean(),
  })
  .strict()
  .refine(
    (page) => !page.canPublish || page.canEdit,
    'Publication requires listing editing authority',
  );
export type GalleryTarget = z.infer<typeof galleryTargetSchema>;
export type GalleryAttach = z.infer<typeof galleryAttachSchema>;
export type GalleryEdit = z.infer<typeof galleryEditSchema>;
export type GalleryQuery = z.infer<typeof galleryQuerySchema>;
export type GalleryMedia = z.infer<typeof galleryMediaSchema>;
