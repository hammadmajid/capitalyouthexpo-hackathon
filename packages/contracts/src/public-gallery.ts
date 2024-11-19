import { z } from 'zod';
import { publicMediaSchema } from './marketplace.js';
const id = z
  .string()
  .uuid()
  .transform((value) => value.toLowerCase());
const position = z.object({ sortOrder: z.number().int().min(0).max(2147483647), id }).strict();
export const publicGalleryCursorSchema = z
  .string()
  .min(38)
  .max(47)
  .regex(/^(0|[1-9][0-9]{0,9}):[0-9a-fA-F-]{36}$/)
  .refine((value) => {
    const separator = value.indexOf(':');
    return position.safeParse({
      sortOrder: Number(value.slice(0, separator)),
      id: value.slice(separator + 1),
    }).success;
  }, 'Invalid gallery continuation')
  .transform((value) => value.toLowerCase());
export function decodePublicGalleryCursor(input: string) {
  const cursor = publicGalleryCursorSchema.parse(input),
    separator = cursor.indexOf(':');
  return { sortOrder: Number(cursor.slice(0, separator)), id: cursor.slice(separator + 1) };
}
export function encodePublicGalleryCursor(sortOrder: number, mediaId: string) {
  return publicGalleryCursorSchema.parse(String(sortOrder) + ':' + mediaId);
}
export const publicGalleryQuerySchema = z
  .object({
    cursor: publicGalleryCursorSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const publicGalleryPageSchema = z
  .object({
    branchId: id,
    data: z
      .array(publicMediaSchema.extend({ altText: z.string().trim().min(1).max(240) }))
      .max(100)
      .refine((rows) => new Set(rows.map((row) => row.id)).size === rows.length),
    nextCursor: publicGalleryCursorSchema.nullable(),
  })
  .strict()
  .refine(
    (page) =>
      page.nextCursor === null ||
      page.data.at(-1)?.id === page.nextCursor.slice(page.nextCursor.indexOf(':') + 1),
    'Continuation must identify the last returned photo',
  );
export type PublicGalleryQuery = z.infer<typeof publicGalleryQuerySchema>;
export type PublicGalleryPage = z.infer<typeof publicGalleryPageSchema>;
